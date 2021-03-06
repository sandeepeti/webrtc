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
    offerToReceiveAudio: 1,
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

//const servers = { 'iceServers': [{ 'urls': 'stun:localhost:8080' }] };
// const servers = { 'iceServers': [{ 'urls': 'stun:stun1.l.google.com:19302' }], 'bundlePolicy': 'max-compat', };
const servers = null;

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
    // create local media stream
    navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
        .then((stream) => {
            localStream = stream;
            localVideo.srcObject = stream;
            socket.emit('create or join', room);
        })
        .catch(handleLocalMediaStreamError);
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
    //console.log(`Message from client: ${clientID} creating offer and sending to ${peerId}`);
    //createMultiPeerConnection(room, peerId, null);
    // socket.emit('handshake-request', clientID, peerId);
    createMultiPeerConnection(room, peerId, false);
});

socket.on('handshake-request', function (peerId) {
    createMultiPeerConnection(room, peerId, true);
});

socket.on('handshake-response', function (peerId) {
    console.log(`Message from client: creating offer`);
    localPeerConnections[peerId].createOffer(offerOptions)
        .then((event) => createdOffer(event, room, peerId)).catch(setSessionDescriptionError);
})

function createMultiPeerConnection(room, peerId, isRequest) {
    console.log(`Message from client (${clientID}): creating RTCPeerConnection`);
    localPeerConnections[peerId] = new RTCPeerConnection(servers);
    localPeerConnections[peerId].addStream(localStream);
    localPeerConnections[peerId].addEventListener('icecandidate', (event) => handleMultiConnection(event, peerId));
    localPeerConnections[peerId].addEventListener('addstream', (event) => gotRemoteMediaStream(event, peerId));
    localPeerConnections[peerId].addEventListener('iceconnectionstatechange', handleConnectionChange);

    // navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
    //     .then((mediaStream) => gotLocalMediaStream(mediaStream, room, peerId, isRequest)).catch(handleLocalMediaStreamError);
    // console.log('Message from client: Requesting local stream');

    if (isRequest) {
        console.log(`Message from client(${clientID}): Sending handshake-response to ${peerId}`);
        socket.emit('handshake-response', clientID, peerId);
    } else {
        // console.log(`Message from client: creating offer`);
        // localPeerConnections[peerId].createOffer(offerOptions)
        //     .then((event) => createdOffer(event, room, peerId)).catch(setSessionDescriptionError);
        console.log(`Message from client(${clientID}): Sending handshake-request to ${peerId}`);
        socket.emit('handshake-request', clientID, peerId);
    }
}

// function gotLocalMediaStream(mediaStream, room, peerId, isRequest) {
//     console.log(`Message from client(${clientID}): adding local stream`);
//     // localVideo.srcObject = mediaStream;
//     // localStream = mediaStream;
//     localPeerConnections[peerId].addEventListener('addstream', gotRemoteMediaStream);
//     //localPeerConnections[peerId].addStream(mediaStream);

//     const videoTracks = localStream.getVideoTracks();
//     const audioTracks = localStream.getAudioTracks();
//     if (videoTracks.length > 0) {
//         console.log(`Message from client: Using video device: ${videoTracks[0].label}.`);
//     }
//     if (audioTracks.length > 0) {
//         console.log(`Message from client Using audio device: ${audioTracks[0].label}.`);
//     }
// }

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

// offer-received event
socket.on('offer-received', function (room, peerId, description) {
    console.log(`Message from client ${clientID}: Offer received from ${peerId}`)
    //createMultiPeerConnection(room, peerId, description);

    console.log(`Message from client: creating answer`);
    setRemoteDescription(description, peerId);

    // create answer
    localPeerConnections[peerId].createAnswer()
        .then((event) => createdAnswer(event, peerId))
        .catch(setSessionDescriptionError);
});



// answer-received event
socket.on('answer-received', function (peerId, description) {
    console.log(`Message from client(${clientID}): answer received from ${peerId}`)
    setRemoteDescription(description, peerId);
    socket.emit('initiate-call', room);
});


// addIceCandidate
socket.on('peer-icecandidate', function (clientId, peerId, iceCandidate) {
    console.log(`Message from client (${clientID}): adding peer icecandidate`, iceCandidate);
    
    // if (iceCandidate.candidate === "" | iceCandidate.candidate === null) {
    //     console.log(`Message from client(${clientID}): adding local stream`);
    //     localPeerConnections[peerId].addStream(localStream);
    // }

    console.log(`Message from client(${clientID}): received icecandidate from ${clientId}`);
    if (clientID !== clientId) {
        localPeerConnections[clientId].addIceCandidate(iceCandidate)
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


function gotRemoteMediaStream(event, peerId) {
    console.log(`Message from client(${clientID}): remote media stream received`);
    const mediaStream = event.stream;

    // create a video element and add to videos div
    let videoDiv = document.getElementById('videos');
    let videoElem = document.createElement('video');
    videoElem.srcObject = mediaStream;
    videoElem.autoplay = true;
    videoDiv.appendChild(videoElem);

    // if (!remoteStream1) {
    //     console.log(`Message from client(${clientID}): remote stream from peer1 received`);
    //     remoteVideo1.srcObject = mediaStream;
    //     remoteStream1 = mediaStream;
    // } else {
    //     console.log(`Message from client(${clientID}): remote stream from peer2 received`);
    //     remoteVideo2.srcObject = mediaStream;
    //     remoteStream2 = mediaStream;
    // }

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
