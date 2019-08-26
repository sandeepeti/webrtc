'use strict';

var os = require('os');
var nodeStatic = require('node-static');
var http = require('http');
var socketIO = require('socket.io');

// cors
// socketIO.set('origins', '*:*');

var _rooms = {};


var fileServer = new (nodeStatic.Server)({
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
var app = http.createServer(function (req, res) {
    fileServer.serve(req, res);
}).listen(8080);

var io = socketIO.listen(app);


io.sockets.on('connection', function (socket) {

    function log() {
        var array = ['Message from Server:'];
        array.push.apply(array, arguments);
        socket.emit('log', array);
    }

    // create or join room
    // if members in a room are 0 then create 
    // if 1 join
    // else emit room-full event 
    socket.on('create or join', function (room) {
        //console.log(`Received request to create or join room from ${socket.id}`);
        log(`Received request to create or join room from ${socket.id}`);

        var clientsInRoom = io.sockets.adapter.rooms[room];
        var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;

        log(`Room ${room} now has ${numClients} client(s)`);

        if (numClients === 0) {
            socket.join(room);
            log(`Client ID ${socket.id} created room ${room}`);

            // create key with room name
            _rooms[room] = 0;
            socket.emit('room-created', room, socket.id);
        } else if (numClients === 1) {
            log(`Client ID ${socket.id} joined room ${room}`);
            socket.join(room);
            socket.emit('room-joined', room, socket.id);
        } else {
            socket.emit('room-full', room);
        }
    });

    // localstream added
    socket.on('local-stream-added', function(room, isInitiator) {
        _rooms[room] += 1

        if (_rooms[room] === 2) {
            io.sockets.in(room).emit('ready');
        }
    })

    // offer received
    socket.on('offer', function (room, clientId, description) {
        log(`offer created by ${clientId}`)
        // _rooms[room][clientId][description] = description;
        io.sockets.to(room).emit('offer-received', clientId, description);
    });


    // answer received
    socket.on('answer', function (room, clientId, description) {
        log(`answer created by ${clientId}`)
        // _rooms[room][clientId][description] = description;
        io.sockets.to(room).emit('answer-received', clientId, description);
    });


    socket.on('ice-candidate', function (room, clientId, iceCandidate) {
        log(`client ${clientId}'s icecandidate received`);
        socket.to(room).emit('peer-icecandidate', clientId, iceCandidate);
    });

    socket.on('initiate-call', function(room) {
        log('Peer connection successful');
        io.sockets.in(room).emit('peer-ready');
    })

    socket.on('ipaddr', function () {
        var ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
            ifaces[dev].forEach(function (details) {
                if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
                    socket.emit('ipaddr', details.address);
                }
            });
        }
    });
})
