declare module "react-native-incall-manager" {
  const InCallManager: {
    start(options?: {
      media?: string;
      auto?: boolean;
    }): void;

    stop(): void;

    setForceSpeakerphoneOn(
      enabled: boolean,
    ): void;
  };

  export default InCallManager;
}