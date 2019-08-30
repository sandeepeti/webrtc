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

    function log(room) {
        var array = ['Message from Server:'];
        array.push.apply(array, arguments);
        if (room) {
            console.log(array);
            io.sockets.in(room).emit('log', array);
        } else {
            socket.emit('log', array);
        }
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
            addPeersToRooms(room);
            socket.emit('room-created', room, socket.id);
        } else if (numClients < 5) {
            log(`Client ID ${socket.id} joined room ${room}`);
            socket.join(room);
            addPeersToRooms(room);
            socket.emit('room-joined', room, socket.id);
            // emit to all other users that peer joined room 
            // so they could create offer
            const peerId = socket.id;
            socket.to(room).emit('peer-joined', room, peerId);
        } else {
            socket.emit('room-full', room);
        }
    });

    // localstream added
    function addPeersToRooms(room) {
        _rooms[room] += 1

        if (_rooms[room] === 3) {
            io.sockets.in(room).emit('ready');
        }
    }

    // handshake-request event
    socket.on('handshake-request', function(clientId, peerId) {
        socket.to(peerId).emit('handshake-request', clientId);
    });

    // handshake-response event
    socket.on('handshake-response', function(clientId, peerId) {
        socket.to(peerId).emit('handshake-response', clientId);
    });

    // offer received
    socket.on('offer', function (room, clientId, peerId, description) {
        log(`offer created by ${clientId} and sending to ${peerId}`);
        // _rooms[room][clientId][description] = description;
        socket.to(peerId).emit('offer-received', room, clientId, description);
    });


    // answer received
    socket.on('answer', function (room, clientId, peerId, description) {
        log(`answer created by ${clientId} and sending to ${peerId}`);
        // _rooms[room][clientId][description] = description;
        socket.to(peerId).emit('answer-received', clientId, description);
    });


    socket.on('ice-candidate', function (room, clientId, peerId, iceCandidate) {
        log(`client ${clientId}'s icecandidate received`);
        socket.to(peerId).emit('peer-icecandidate', clientId, peerId, iceCandidate);
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
