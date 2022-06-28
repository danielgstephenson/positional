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

const state = {
  actors: [],
  cores: [],
  guards: [],
  walls: [],
  bodies: [],
  players: {}
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
    if (player.core) player.core.active = false
    if (player.guard) player.guard.active = false
  })
  socket.on('updateServer', msg => {
    const player = state.players[msg.id]
    if (player) {
      const vector = { x: 0, y: 0 }
      if (msg.input.up) vector.y += -1
      if (msg.input.down) vector.y += 1
      if (msg.input.left) vector.x += -1
      if (msg.input.right) vector.x += 1
      const direction = Matter.Vector.normalise(vector)
      if (player.core) {
        player.core.force = Matter.Vector.mult(direction, 0.001)
      }
    }
  })
})

function makePlayer (id) {
  const player = { id }
  const core = state.cores.find(c => !c.active)
  if (core) {
    player.core = core
    player.guard = core.guard
    spawn(core)
  }
  player.connected = true
  state.players[id] = player
  return player
}

function spawn (core) {
  const sign = 2 * core.team - 3
  Matter.Body.setPosition(core.body, { x: 0, y: 800 * sign })
  Matter.Body.setVelocity(core.body, { x: 0, y: 0 })
  core.playerId = id
  core.active = true
  core.alive = true
  core.birth = engine.timing.timestamp
  core.age = 0
  const guard = core.guard
  Matter.Body.setPosition(guard.body, { x: 0, y: 800 * sign })
  Matter.Body.setVelocity(guard.body, { x: 0, y: 0 })
  guard.playerId = id
  guard.active = true
  guard.alive = true
  guard.birth = engine.timing.timestamp
  guard.age = 0
}

async function updateClients () {
  const sockets = await io.fetchSockets()
  sockets.forEach(socket => {
    const msg = {}
    msg.cores = state.cores.map(core => {
      return {
        id: core.id,
        role: 'core',
        x: core.body.position.x,
        y: core.body.position.y,
        radius: core.body.circleRadius,
        team: core.team,
        active: core.active,
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
        playerId: guard.playerId
      }
    })
    msg.walls = state.walls.map(actor => {
      return {
        id: actor.id,
        role: 'wall',
        vertices: actor.body.vertices.map(({ x, y }) => ({ x, y }))
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
  wall.body = Matter.Bodies.rectangle(x, y, width, height, { isStatic: true })
  state.bodies.push(wall.body)
  state.actors[wall.body.id] = wall
  state.walls.push(wall)
  wall.id = state.walls.length - 1
  return wall
}

function makeCore (team) {
  const core = {}
  core.body = Matter.Bodies.circle(0, 0, 30)
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
  core.playerId = ''
  const guard = {}
  guard.body = Matter.Bodies.circle(0, 0, 20)
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
const wallThickness = 50
const size = 1000
makeWall(0, size + 0.5 * wallThickness, 2 * size + 2 * wallThickness, wallThickness)
makeWall(0, -size - 0.5 * wallThickness, 2 * size + 2 * wallThickness, wallThickness)
makeWall(size + 0.5 * wallThickness, 0, wallThickness, 2 * size + 2 * wallThickness)
makeWall(-size - 0.5 * wallThickness, 0, wallThickness, 2 * size + 2 * wallThickness)
makeWall(0, 0.5 * size, 1.0 * size, wallThickness)
makeWall(0, -0.5 * size, 1.0 * size, wallThickness)
makeCore(1)
makeCore(2)
Matter.Composite.add(engine.world, state.bodies)
Matter.Runner.run(runner, engine)

Matter.Events.on(engine, 'afterUpdate', e => {
  state.cores.forEach(core => {
    Matter.Body.applyForce(core.body, core.body.position, core.force)
    core.age = engine.timing.timestamp - core.birth
  })
  state.guards.forEach(guard => {
    const vector = Matter.Vector.sub(guard.core.body.position, guard.body.position)
    const force = Matter.Vector.mult(vector, 0.000003)
    Matter.Body.applyForce(guard.body, guard.body.position, force)
    guard.age = engine.timing.timestamp - guard.birth
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
      if (labels[0] === 'core' && labels[1] === 'core') {
        pair.isActive = false
      }
      if (labels[0] === 'core' && labels[1] === 'guard') {
        pair.isActive = false
      }
    })
  })
})

setInterval(updateClients, 20)
