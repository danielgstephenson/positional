const path = require('path')
const express = require('express')
const config = require('./config.json')
const fs = require('fs')
const http = require('http')
const https = require('https')
const socketIo = require('socket.io')
const app = express()
const Matter = require('matter-js')

const options = {}
if (config.secure) {
  options.key = fs.readFileSync('sis-key.pem')
  options.cert = fs.readFileSync('sis-cert.pem')
}
const server = config.secure ? https.createServer(options, app) : http.Server(app)
const io = config.secure ? socketIo(server, options) : socketIo(server)

function range (n) { return [...Array(n).keys()] }

const state = {
  actors: [],
  cores: [],
  guards: [],
  walls: [],
  bodies: [],
  players: {},
  safeTime: 4000,
  scores: [0, 0],
  goal: 1000,
  gameOver: false,
  countdown: 9,
  dt: 0
}

app.use(express.static(path.join(__dirname, 'public')))

app.get('/', (request, response) =>
  response.sendFile(path.join(__dirname, 'public', 'client.html'))
)

io.on('connection', socket => {
  console.log('socket.id =', socket.id)
  const player = makePlayer(socket.id)
  socket.on('disconnect', (reason) => {
    player.connected = false
    detach(player)
  })
  socket.on('joinGame', msg => {
    const player = state.players[msg.id]
    player.joined = true
    const core = state.cores.find(c => !c.active)
    if (core) {
      attach(player, core)
      spawn(core)
    }
  })
  socket.on('updateServer', msg => {
    const player = state.players[msg.id]
    if (player) {
      player.name = msg.name
      const vector = { x: 0, y: 0 }
      if (msg.input.up) vector.y += -1
      if (msg.input.down) vector.y += 1
      if (msg.input.left) vector.x += -1
      if (msg.input.right) vector.x += 1
      const direction = Matter.Vector.normalise(vector)
      if (player.core) {
        if (player.core.alive) player.core.force = Matter.Vector.mult(direction, 0.001)
        else if (msg.respawn) {
          player.alive = true
          spawn(player.core)
        }
      }
    }
  })
})

function attach (player, core) {
  const guard = core.guard
  core.player = player
  guard.player = player
  core.playerId = player.id
  guard.playerId = player.id
  core.active = true
  guard.active = true
  player.core = core
  player.guard = guard
  player.team = core.team
}

function detach (player) {
  if (player.core) {
    const core = player.core
    const guard = core.guard
    core.player = null
    guard.player = null
    core.playerId = null
    guard.playerId = null
    core.active = false
    guard.active = false
  }
  player.core = null
  player.guard = null
}

function makePlayer (id) {
  const player = { id }
  player.connected = true
  player.alive = true
  player.score = 0
  player.team = 0
  player.name = ''
  player.joined = false
  state.players[id] = player
  return player
}

function spawn (core) {
  const sign = 2 * core.team - 3
  Matter.Body.setPosition(core.body, { x: 0, y: 1700 * sign })
  Matter.Body.setVelocity(core.body, { x: 0, y: 0 })
  core.alive = true
  core.birth = engine.timing.timestamp
  core.age = 0
  const guard = core.guard
  Matter.Body.setPosition(guard.body, { x: 0, y: 1700 * sign })
  Matter.Body.setVelocity(guard.body, { x: 0, y: 0 })
  guard.alive = true
  guard.birth = engine.timing.timestamp
  guard.age = 0
}

function die (core) {
  core.alive = false
  core.guard.alive = false
  core.player.alive = false
  Matter.Body.setVelocity(core.body, { x: 0, y: 0 })
  Matter.Body.setVelocity(core.guard.body, { x: 0, y: 0 })
}

function setCentral () {
  state.cores.forEach(core => { core.distFromCenter = Matter.Vector.magnitude(core.body.position) })
  const liveCores = state.cores.filter(core => core.alive && core.active)
  const distArray = liveCores.map(core => core.distFromCenter)
  const minDist = Math.min(900, ...distArray)
  state.cores.forEach(core => {
    core.central = core.alive && core.active && core.distFromCenter <= minDist
  })
}

function countScores () {
  state.scores = [0, 0]
  Object.values(state.players).forEach(player => {
    state.scores[player.team - 1] += Math.round(player.score)
  })
  if (Math.max(...state.scores) >= state.goal && !state.gameOver) {
    state.gameOver = true
    state.countdown = 9
  }
  if (state.gameOver && state.countdown <= 0) {
    startGame()
  }
}

function startGame () {
  Object.values(state.players).forEach(player => {
    player.score = 0
    player.joined = false
    player.alive = true
    detach(player)
  })
  state.cores.forEach(core => spawn(core))
  state.gameOver = false
}

async function updateClients () {
  const sockets = await io.fetchSockets()
  setCentral()
  countScores()
  sockets.forEach(socket => {
    const player = state.players[socket.id]
    const msg = {
      alive: player.alive,
      safeTime: state.safeTime,
      joined: player.joined,
      scores: state.scores,
      gameOver: state.gameOver,
      countdown: Math.round(state.countdown)
    }
    msg.players = Object.values(state.players).map(player => {
      return {
        id: player.id,
        joined: player.joined,
        connected: player.connected,
        name: player.name,
        team: player.team,
        score: Math.round(player.score)
      }
    })
    msg.cores = state.cores.map(core => {
      return {
        id: core.id,
        role: 'core',
        x: core.body.position.x,
        y: core.body.position.y,
        radius: core.body.circleRadius,
        team: core.team,
        active: core.active,
        alive: core.alive,
        central: core.central,
        playerId: core.playerId,
        guardId: core.guard.id,
        age: core.age
      }
    })
    msg.guards = state.guards.map(guard => {
      return {
        id: guard.id,
        role: 'guard',
        x: guard.body.position.x,
        y: guard.body.position.y,
        radius: guard.body.circleRadius,
        team: guard.team,
        active: guard.active,
        alive: guard.alive,
        playerId: guard.playerId
      }
    })
    msg.walls = state.walls.map(actor => {
      return {
        id: actor.id,
        role: 'wall',
        vertices: actor.body.vertices.map(({ x, y }) => ({ x, y })),
        joined: state.joined
      }
    })
    msg.id = socket.id
    socket.emit('updateClient', msg)
  })
}

server.listen(3000, () => {
  const port = server.address().port
  console.log(`listening on port: ${port}`)
})

function makeWall (x, y, width, height) {
  const wall = {}
  wall.role = 'wall'
  wall.active = true
  wall.alive = true
  wall.body = Matter.Bodies.rectangle(x, y, width, height, { isStatic: true })
  state.bodies.push(wall.body)
  state.actors[wall.body.id] = wall
  state.walls.push(wall)
  wall.id = state.walls.length - 1
  return wall
}

function makeCore (team) {
  const core = {}
  const sign = 2 * team - 3
  core.body = Matter.Bodies.circle(0, 1700 * sign, 30)
  core.body.label = 'core'
  core.body.frictionAir = 0.01
  core.force = { x: 0, y: 0 }
  state.bodies.push(core.body)
  state.actors[core.body.id] = core
  state.cores.push(core)
  core.id = state.cores.length - 1
  core.team = team
  core.active = false
  core.alive = true
  core.central = false
  core.distFromCenter = Matter.Vector.magnitude(core.body.position)
  core.playerId = ''
  const guard = {}
  guard.body = Matter.Bodies.circle(0, 1700 * sign, 20)
  guard.body.label = 'guard'
  guard.body.frictionAir = 0.01
  state.bodies.push(guard.body)
  state.actors[guard.body.id] = guard
  state.guards.push(guard)
  guard.id = state.guards.length - 1
  guard.team = team
  guard.active = false
  guard.alive = true
  guard.playerId = ''
  core.guard = guard
  guard.core = core
  core.birth = engine.timing.timestamp
  core.age = 0
  return core
}

const engine = Matter.Engine.create()
engine.gravity = { x: 0, y: 0 }
const runner = Matter.Runner.create()
const size = 1000
const H = 2 * size
const W = 1 * size
const Z = 50
makeWall(0, H + 0.5 * Z, 2 * W + 2 * Z, Z)
makeWall(0, -H - 0.5 * Z, 2 * W + 2 * Z, Z)
makeWall(W + 0.5 * Z, 0, Z, 2 * H + 2 * Z)
makeWall(-W - 0.5 * Z, 0, Z, 2 * H + 2 * Z)
makeWall(0, 0.6 * H, 1.0 * W, Z)
makeWall(0, -0.6 * H, 1.0 * W, Z)
range(5).forEach(i => {
  makeCore(1)
  makeCore(2)
})
Matter.Composite.add(engine.world, state.bodies)
Matter.Runner.run(runner, engine)

Matter.Events.on(engine, 'afterUpdate', e => {
  state.dt = engine.timing.lastDelta / 1000
  if (state.gameOver) {
    state.countdown = Math.max(0, state.countdown += -state.dt)
  }
  state.cores.forEach(core => {
    if (core.alive && !state.gameOver) {
      Matter.Body.applyForce(core.body, core.body.position, core.force)
      core.age = engine.timing.timestamp - core.birth
    }
    if (core.player && core.central && !state.gameOver) {
      core.player.score += 10 * state.dt
    }
  })
  state.guards.forEach(guard => {
    if (guard.alive && !state.gameOver) {
      const vector = Matter.Vector.sub(guard.core.body.position, guard.body.position)
      const force = Matter.Vector.mult(vector, 0.000003)
      Matter.Body.applyForce(guard.body, guard.body.position, force)
      guard.age = engine.timing.timestamp - guard.birth
    }
  })
})

Matter.Events.on(engine, 'collisionStart', e => {
  e.pairs.forEach(pair => {
    const orderings = [
      [pair.bodyA, pair.bodyB],
      [pair.bodyB, pair.bodyA]
    ]
    orderings.forEach(ordering => {
      const labels = ordering.map(body => body.label)
      const actors = ordering.map(body => state.actors[body.id])
      const alive = actors[0].alive && actors[1].alive
      const active = actors[0].active && actors[1].active
      if (alive && active) {
        if (labels[0] === 'core' && labels[1] === 'guard') {
          pair.isActive = false
          const core = actors[0]
          const guard = actors[1]
          const enemy = core.team !== guard.team
          const unsafe = core.age > state.safeTime
          if (enemy && unsafe && core.alive && !state.gameOver) {
            die(core)
            if (guard.player && core.player) {
              const transfer = 0.5 * core.player.score
              guard.player.score += transfer
              core.player.score += -transfer
            }
          }
        }
      } else {
        pair.isActive = false
      }
    })
  })
})

setInterval(updateClients, 20)
