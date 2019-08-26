'use strict';

// if isInitiator, then he will create offer for video call
// else he will create answer
let isInitiator;
let clientID;
let localPeerConnections = {};

const mediaStreamConstraints = {
    video: true,
    audio: true,
};


const offerOptions = {
    offerToReceiveVideo: 1,
};

let localVideo = document.getElementById('localVideo');
let remoteVideo1 = document.getElementById('remoteVideo1');
let remoteVideo2 = document.getElementById('remoteVideo2');

let localStream;
let remoteStream1;
let remoteStream2;

// to manage multiple RTCPeerConnections
let numPeers = 0;
let peerMappings = {};

// const servers = { 'iceServers': [{ 'urls': 'stun:localhost:8080' }] };
const servers = { 'iceServers': [{ 'urls': 'stun:stun1.l.google.com:19302' }] };
//const servers = null;

let localPeerConnection;
let remotePeerConnection;
let endCallButton = document.getElementById('endCallButton');

window.room = prompt("Enter room name:");

var socket = io.connect("http://localhost:8080");

socket.on('log', function (array) {
    console.log.apply(console, array);
});


// create or join room
if (room !== "" && room !== null) {
    console.log(`Message from client: Asking to create or join room ${room}`);
    //createPeerConnection(room);
    socket.emit('create or join', room);
}


// if room created
socket.on('room-created', function (room, clientId) {
    console.log(`Message from client: Joined room ${room} as initiator`)
    isInitiator = true;
    clientID = clientId;
});

// if joined room
socket.on('room-joined', function (room, clientId) {
    console.log(`Message from client: Joined room ${room} as non-initiator`)
    isInitiator = false;
    clientID = clientId;
});

// if room full
socket.on('room-full', function (room) {
    alert(`Room '${room}' is full`);
});


socket.on('peer-joined', function (room, peerId) {
    console.log(`Message from client: ${clientID} creating offer and sending to ${peerId}`);
    createMultiPeerConnection(room, peerId, null);
    // localPeerConnections[peerId].createOffer(offerOptions)
    //     .then((event) => createdOffer(event, room, peerId)).catch(setSessionDescriptionError);
});


// offer-received event
socket.on('offer-received', function (room, peerId, description) {
    console.log(`Message from client ${clientID}: Offer received from ${peerId}`)
    createMultiPeerConnection(room, peerId, description);
    // setRemoteDescription(description, peerId);

    // // create answer
    // localPeerConnections[peerId].createAnswer()
    //     .then((event) => createdAnswer(event, peerId))
    //     .catch(setSessionDescriptionError);
});


function gotLocalMediaStream(mediaStream, room, peerId, description) {
    console.log(`Message from client(${clientID}): adding local stream`);
    localVideo.srcObject = mediaStream;
    localStream = mediaStream;
    localPeerConnections[peerId].addStream(mediaStream);
    localPeerConnections[peerId].addEventListener('addstream', gotRemoteMediaStream);

    const videoTracks = localStream.getVideoTracks();
    const audioTracks = localStream.getAudioTracks();
    if (videoTracks.length > 0) {
        console.log(`Message from client: Using video device: ${videoTracks[0].label}.`);
    }
    if (audioTracks.length > 0) {
        console.log(`Message from client Using audio device: ${audioTracks[0].label}.`);
    }

    // emit event that stream added
    // socket.emit('local-stream-added', room, isInitiator);
    if (description !== null) {
        console.log(`Message from client: creating answer`);
        setRemoteDescription(description, peerId);

        // create answer
        localPeerConnections[peerId].createAnswer()
            .then((event) => createdAnswer(event, peerId))
            .catch(setSessionDescriptionError);
    } else {
        console.log(`Message from client: creating offer`);
        localPeerConnections[peerId].createOffer(offerOptions)
            .then((event) => createdOffer(event, room, peerId)).catch(setSessionDescriptionError);
    }
}

// answer-received event
socket.on('answer-received', function (peerId, description) {
    console.log(`Message from client(${clientID}): answer received from ${peerId}`)
    setRemoteDescription(description, peerId);
    socket.emit('initiate-call', room);
});


// addIceCandidate
socket.on('peer-icecandidate', function (clientId, peerId, iceCandidate) {
    console.log(`Message from client (${clientID}): adding peer icecandidate`, iceCandidate);
    if (clientID !== peerId) {
        localPeerConnections[peerId].addIceCandidate(iceCandidate)
            .then(handleConnectionSuccess)
            .catch((error) => {
                handleConnectionFailure(error);
            });
    }
});


// peer-ready event
socket.on('peer-ready', function () {
    console.log('Message from client: peers ready');
});


// function createPeerConnection(room) {
//     console.log(`Message from client (${clientID}): creating RTCPeerConnection`);
//     localPeerConnection = new RTCPeerConnection(servers);
//     localPeerConnection.addEventListener('icecandidate', handleConnection);
//     localPeerConnection.addEventListener('addstream', gotRemoteMediaStream);
//     localPeerConnection.addEventListener('iceconnectionstatechange', handleConnectionChange);

//     if (!localStream) {
//         navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
//             .then((mediaStream) => gotLocalMediaStream(mediaStream, room)).catch(handleLocalMediaStreamError);
//         console.log('Message from client: Requesting local stream');
//     }
// }


function createMultiPeerConnection(room, peerId, description) {
    console.log(`Message from client (${clientID}): creating RTCPeerConnection`);
    localPeerConnections[peerId] = new RTCPeerConnection(servers);
    localPeerConnections[peerId].addEventListener('icecandidate', handleMultiConnection);
    localPeerConnections[peerId].addEventListener('addstream', gotRemoteMediaStream);
    localPeerConnections[peerId].addEventListener('iceconnectionstatechange', handleConnectionChange);

    navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
        .then((mediaStream) => gotLocalMediaStream(mediaStream, room, peerId, description)).catch(handleLocalMediaStreamError);
    console.log('Message from client: Requesting local stream');
}


// setRemoteDescription
function setRemoteDescription(description, peerId) {
    console.log(`Message from client (${clientID}): setting remote description ${description}`);
    localPeerConnections[peerId].setRemoteDescription(description)
        .then(() => {
            console.log('Message from client: remote description set');
        })
        .catch((error) => {
            console.error('Message from client: remote description setting failed');
        });
}

// createdOffer 
function createdOffer(description, room, peerId) {
    console.log(`Message from client(${clientID}): created offer and sending to ${peerId}`);
    localPeerConnections[peerId].setLocalDescription(description)
        .then(() => {
            console.log(`Message from client${clientID}: localDescription set`);
            socket.emit('offer', room, clientID, peerId, description);
        })
        .catch((error) => {
            console.error('Message from client: Error setting localDescription', error);
        });
}


// createdAnswer
function createdAnswer(description, peerId) {
    console.log(`Message from client(${clientID}): created answer and sending to ${peerId}`);
    localPeerConnections[peerId].setLocalDescription(description)
        .then(() => {
            console.log(`Message from client(${clientID}): localDescription set`)
            socket.emit('answer', room, clientID, peerId, description);
        })
        .catch((error) => {
            console.error('Message from client: Error setting localDescription', error);
        });
}


// send iceCandidate to server
function handleConnection(event) {
    const iceCandidate = event.candidate;

    if (iceCandidate) {
        const newIceCandidate = new RTCIceCandidate(iceCandidate);
        console.log(`Message from client(${clientID}): Created iceCandidate`, iceCandidate);
        socket.emit('ice-candidate', room, clientID, newIceCandidate);
    }
}

function handleMultiConnection(event, peerId) {
    const iceCandidate = event.candidate;

    if (iceCandidate) {
        const newIceCandidate = new RTCIceCandidate(iceCandidate);
        console.log(`Message from client(${clientID}): Created iceCandidate`, iceCandidate);
        socket.emit('ice-candidate', room, clientID, peerId, newIceCandidate);
    }
}

function handleConnectionChange(event) {
    console.log('Message from client: ICE state change event: ', event);
}


function gotRemoteMediaStream(event) {
    console.log(`Message from client(${clientID}): remote media stream received`);
    const mediaStream = event.stream;
    if (!remoteStream1) {
        console.log(`Message from client(${clientID}): remote stream from peer1 received`);
        remoteVideo1.srcObject = mediaStream;
        remoteStream1 = mediaStream;
    } else {
        console.log(`Message from client(${clientID}): remote stream from peer2 received`);
        remoteVideo2.srcObject = mediaStream;
        remoteStream2 = mediaStream;
    }

    // endCallButton.style.visibility = 'visible';
    // endCallButton.addEventListener('click', endCall);

    console.log('Message from client: Remote peer connection received remote stream.');
}


function endCall() {
    localPeerConnections.close();
    localPeerConnection = null;
    remoteVideo.style.visibility = 'hidden';
    endCallButton.style.visibility = 'hidden';
}


function handleLocalMediaStreamError(error) {
    console.error(`Message from client: navigator.getUserMedia error: ${error.toString()}.`);
}


function handleConnectionSuccess() {
    console.log('Message from client: Peer icecandidate added');
}

function handleConnectionFailure(error) {
    console.error('Message from client: peer icecandidate error: ', error)
}


function setSessionDescriptionError(error) {
    console.error(`Failed to create session description: ${error.toString()}.`);
}
