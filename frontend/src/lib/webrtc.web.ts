// Web preview stub. `react-native-webrtc` has no web build, so importing it
// breaks the Metro web bundle. Voice calls only run on the native app build;
// on web these are inert placeholders (the call "Accept" path already early
// returns on Platform.OS === "web").
export const mediaDevices: any = {
  getUserMedia: async () => {
    throw new Error("WebRTC is not available on web");
  },
};

export class RTCPeerConnection {
  constructor(..._args: any[]) {
    throw new Error("WebRTC is not available on web");
  }
}

export class RTCSessionDescription {
  init: any;
  constructor(init: any) {
    this.init = init;
  }
}

export class RTCIceCandidate {
  init: any;
  constructor(init: any) {
    this.init = init;
  }
}
