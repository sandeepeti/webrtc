    'use strict';

// if isInitiator, then he will create offer for video call
// else he will create answer
let isInitiator;
let clientID;

const mediaStreamConstraints = {
    video: true,
    audio: true,
};

const offerOptions = {
    offerToReceiveVideo: 1,
};

let localVideo = document.getElementById('localVideo');
let remoteVideo = document.getElementById('remoteVideo');

let localStream;
let remoteStream;

// const servers = { 'iceServers': [{ 'urls': 'stun:localhost:8080' }] };
const servers = { 'iceServers': [{ 'urls': 'stun:stun1.l.google.com:19302'}]};
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
    createPeerConnection();
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
})

// on ready event - send iceCandidate
socket.on('ready', function () {
    // create offer if initiator else wait for event offer-created
    if (isInitiator) {
        localPeerConnection.createOffer(offerOptions)
            .then(createdOffer).catch(setSessionDescriptionError);
    }
});


// offer-received event
socket.on('offer-received', function (clientid, description) {
    if (!isInitiator && clientID != clientid) {

        setRemoteDescription(description);

        // create answer
        localPeerConnection.createAnswer()
            .then(createdAnswer)
            .catch(setSessionDescriptionError);
    }
});


// answer-received event
socket.on('answer-received', function (clientId, description) {
    if (isInitiator && clientID != clientId) {
        setRemoteDescription(description);
        socket.emit('initiate-call', room);
    }
});


// addIceCandidate
socket.on('peer-icecandidate', function (clientId, iceCandidate) {
    console.log(`${clientID} adding peer icecandidate`);
    if (clientID !== clientId) {
        localPeerConnection.addIceCandidate(iceCandidate)
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


function createPeerConnection() {
    localPeerConnection = new RTCPeerConnection(servers);
    localPeerConnection.addEventListener('icecandidate', handleConnection);
    localPeerConnection.addEventListener('addstream', gotRemoteMediaStream);
    localPeerConnection.addEventListener('iceconnectionstatechange', handleConnectionChange);

    navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
        .then(gotLocalMediaStream).catch(handleLocalMediaStreamError);
    console.log('Message from client: Requesting local stream');
}


// setRemoteDescription
function setRemoteDescription(description) {
    localPeerConnection.setRemoteDescription(description)
        .then(() => {
            console.log('Message from client: remote description set');
        })
        .catch((error) => {
            console.Error('Message from client: remote description setting failed');
        });
}

// createdOffer 
function createdOffer(description) {
    if (isInitiator) {
        localPeerConnection.setLocalDescription(description)
            .then(() => {
                console.log('Message from client: localDescription set');
                socket.emit('offer', room, clientID, description);
            })
            .catch((error) => {
                console.error('Message from client: Error setting localDescription', error);
            });
    }
}


// createdAnswer
function createdAnswer(description) {
    if (!isInitiator) {
        localPeerConnection.setLocalDescription(description)
            .then(() => {
                console.log('Message from client: localDescription set')
                socket.emit('answer', room, clientID, description);
            })
            .catch((error) => {
                console.error('Message from client: Error setting localDescription', error);
            });
    }
}


// send iceCandidate to server
function handleConnection(event) {
    const iceCandidate = event.candidate;

    if (iceCandidate) {
        const newIceCandidate = new RTCIceCandidate(iceCandidate);
        console.log('Message from client: Created iceCandidate: ', iceCandidate);
        socket.emit('ice-candidate', room, clientID, newIceCandidate);
    }
}


// on icecandidates-received event both users have sent their 
// respective ice-candidates to server and we are ready to 
// add the remote peer's ice-candidate to our peer connection
// socket.on('icecandidates-received', function (icecandidatesDict) {
//     console.log('Message from client: peers icecandidate received from server');
//     for (var client in Object.keys(icecandidatesDict)) {
//         if (client !== clientID) {
//             localPeerConnection.addIceCandidate(icecandidatesDict[client][iceCandidate])
//                 .then(handleConnectionSuccess)
//                 .catch((error) => {
//                     handleConnectionFailure(error);
//                 });
//         }
//     }
// })

function handleConnectionChange(event) {
    console.log('Message from client: ICE state change event: ', event);
}


function gotLocalMediaStream(mediaStream) {
    localVideo.srcObject = mediaStream;
    localStream = mediaStream;
    localPeerConnection.addStream(mediaStream);
    localPeerConnection.addEventListener('addstream', gotRemoteMediaStream);

    const videoTracks = localStream.getVideoTracks();
    const audioTracks = localStream.getAudioTracks();
    if (videoTracks.length > 0) {
        console.log(`Message from client: Using video device: ${videoTracks[0].label}.`);
    }
    if (audioTracks.length > 0) {
        console.log(`Message from client Using audio device: ${audioTracks[0].label}.`);
    }

    // emit event that stream added
    socket.emit('local-stream-added', room, isInitiator);
}


function gotRemoteMediaStream(event) {
    const mediaStream = event.stream;
    remoteVideo.srcObject = mediaStream;
    remoteStream = mediaStream;

    endCallButton.style.visibility = 'visible';
    endCallButton.addEventListener('click', endCall);

    console.log('Message from client: Remote peer connection received remote stream.');
}


function endCall() {
    localPeerConnection.close();
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
