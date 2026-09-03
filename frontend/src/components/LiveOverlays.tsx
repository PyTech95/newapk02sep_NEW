import { Feather } from "@expo/vector-icons";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import InCallManager from "react-native-incall-manager";
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from "react-native-webrtc";

import {
  IncomingCall,
  listAlerts,
  listIncomingCalls,
  rejectCall,
  endCall,
  getCallDetails,
  acceptCall,
  sendCallCandidate,
  WebRTCIceCandidatePayload,
} from "@/src/api/endpoints";

import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { RTC_CONFIG } from "@/src/lib/rtc";
import { colors, fonts, fontSize, spacing } from "@/src/theme";

const CALL_POLL_MS = 5000;
const ALERT_POLL_MS = 15000;
const CANDIDATE_POLL_MS = 1000;

type CallPhase = "idle" | "ringing" | "connecting" | "connected";

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");

  const secs = (seconds % 60).toString().padStart(2, "0");

  return `${mins}:${secs}`;
};

const candidateKey = (candidate: WebRTCIceCandidatePayload) =>
  [
    candidate.candidate,
    candidate.sdpMid ?? "",
    candidate.sdpMLineIndex ?? "",
  ].join("|");

export function LiveOverlays() {
  const { user } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [call, setCall] = useState<IncomingCall | null>(null);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const ringtone = useAudioPlayer(
    require("../../assets/sounds/ringtone.wav"),
  );

  const callRef = useRef<IncomingCall | null>(null);
  callRef.current = call;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<any>(null);
  const candidatePollRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);

  const candidatePollBusy = useRef(false);
  const appliedCandidates = useRef<Set<string>>(new Set());
  const endingRef = useRef(false);

  const handledCalls = useRef<Set<string>>(new Set());
  const knownAlerts = useRef<Set<string>>(new Set());
  const alertsPrimed = useRef(false);

  const pulse = useRef(new Animated.Value(0)).current;

  // -------------------------------------------------------------------------
  // Incoming call polling
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const items = await listIncomingCalls();

        if (cancelled) return;

        const next = items.find(
          (c) => !handledCalls.current.has(c.call_id),
        );

        if (!callRef.current && next) {
          endingRef.current = false;
          appliedCandidates.current.clear();
          setMuted(false);
          setSeconds(0);
          setCall(next);
          setPhase("ringing");
        }
      } catch {
        // ignore polling errors
      }
    };

    tick();

    const id = setInterval(tick, CALL_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.id]);

  // -------------------------------------------------------------------------
  // Alert polling
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const items = await listAlerts();

        if (cancelled || !Array.isArray(items)) return;

        if (!alertsPrimed.current) {
          items.forEach((a) => {
            if (a?.id) knownAlerts.current.add(a.id);
          });

          alertsPrimed.current = true;
          return;
        }

        const fresh = items.filter(
          (a) => a?.id && !knownAlerts.current.has(a.id),
        );

        fresh.forEach((a) => {
          if (a?.id) knownAlerts.current.add(a.id);
        });

        if (fresh.length) {
          const a: any = fresh[0];

          const label =
            a.number_plate || a.name || "your item";

          const kind = String(a.type || "alert").replace(
            /_/g,
            " ",
          );

          if (Platform.OS !== "web") {
            Vibration.vibrate([0, 500, 250, 500]);
          }

          if (!callRef.current) {
            try {
              setAudioModeAsync({
                playsInSilentMode: true,
              }).catch(() => {});

              ringtone.loop = false;
              ringtone.seekTo(0);
              ringtone.play();
            } catch {
              // ignore audio failures
            }
          }

          toast(
            `🔔 New ${kind} on ${label} — open Alerts to view`,
            "error",
          );
        }
      } catch {
        // ignore
      }
    };

    tick();

    const id = setInterval(tick, ALERT_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.id]);

  // -------------------------------------------------------------------------
  // Incoming ringtone
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!call || phase !== "ringing") return;

    if (Platform.OS !== "web") {
      Vibration.vibrate(
        [0, 700, 600, 700, 600],
        true,
      );
    }

    try {
      setAudioModeAsync({
        playsInSilentMode: true,
      }).catch(() => {});

      ringtone.loop = true;
      ringtone.seekTo(0);
      ringtone.play();
    } catch {
      // ignore
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.in(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );

    loop.start();

    return () => {
      Vibration.cancel();
      loop.stop();

      try {
        ringtone.pause();
        ringtone.seekTo(0);
      } catch {
        // ignore
      }
    };
  }, [call, phase]);

  // -------------------------------------------------------------------------
  // Connected call timer
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (phase !== "connected") return;

    const id = setInterval(() => {
      setSeconds((current) => current + 1);
    }, 1000);

    return () => clearInterval(id);
  }, [phase]);

  const stopRinging = () => {
    Vibration.cancel();

    try {
      ringtone.pause();
      ringtone.seekTo(0);
    } catch {
      // ignore
    }
  };

  const cleanupPeer = () => {
    if (candidatePollRef.current) {
      clearInterval(candidatePollRef.current);
      candidatePollRef.current = null;
    }

    candidatePollBusy.current = false;

    try {
      localStreamRef.current
        ?.getTracks?.()
        ?.forEach((track: any) => track.stop());
    } catch {
      // ignore
    }

    localStreamRef.current = null;

    try {
      pcRef.current?.close();
    } catch {
      // ignore
    }

    pcRef.current = null;

    try {
      InCallManager.stop();
    } catch {
      // ignore
    }

    appliedCandidates.current.clear();
  };

  const finishCallLocally = (
    message?: string,
  ) => {
    const current = callRef.current;

    if (current) {
      handledCalls.current.add(current.call_id);
    }

    stopRinging();
    cleanupPeer();

    setCall(null);
    setPhase("idle");
    setMuted(false);
    setSeconds(0);

    endingRef.current = false;

    if (message) {
      toast(message, "success");
    }
  };

  const applyCallerCandidates = async (
    candidates: WebRTCIceCandidatePayload[] = [],
  ) => {
    const pc = pcRef.current;

    if (!pc || !pc.remoteDescription) return;

    for (const candidate of candidates) {
      if (!candidate?.candidate) continue;

      const key = candidateKey(candidate);

      if (appliedCandidates.current.has(key)) {
        continue;
      }

      try {
        await pc.addIceCandidate(
          new RTCIceCandidate(candidate as any),
        );

        appliedCandidates.current.add(key);
      } catch (error) {
        console.warn(
          "Failed to add caller ICE candidate",
          error,
        );
      }
    }
  };

  const startCandidatePolling = (
    callId: string,
  ) => {
    if (candidatePollRef.current) {
      clearInterval(candidatePollRef.current);
    }

    candidatePollRef.current = setInterval(
      async () => {
        if (candidatePollBusy.current) return;

        candidatePollBusy.current = true;

        try {
          const details = await getCallDetails(callId);

          const status = String(
            details?.status || "",
          ).toLowerCase();

          if (
            ["ended", "rejected", "missed"].includes(
              status,
            )
          ) {
            finishCallLocally("Call ended");
            return;
          }

          await applyCallerCandidates(
            details?.caller_candidates || [],
          );
        } catch {
          // temporary network errors should not end the call
        } finally {
          candidatePollBusy.current = false;
        }
      },
      CANDIDATE_POLL_MS,
    );
  };

  const hangup = async () => {
    const current = callRef.current;

    if (!current || endingRef.current) return;

    endingRef.current = true;

    try {
      await endCall(current.call_id);
    } catch {
      // Still clean up locally.
    }

    finishCallLocally("Call ended");
  };

  const onDecline = async (
    current: IncomingCall,
  ) => {
    if (endingRef.current) return;

    endingRef.current = true;

    try {
      await rejectCall(current.call_id);
    } catch {
      // ignore
    }

    handledCalls.current.add(current.call_id);

    finishCallLocally();
  };

  const onAccept = async (
    current: IncomingCall,
  ) => {
    if (
      Platform.OS === "web" ||
      phase !== "ringing"
    ) {
      return;
    }

    handledCalls.current.add(current.call_id);

    stopRinging();
    setPhase("connecting");
    setMuted(false);
    setSeconds(0);

    try {
      // -------------------------------------------------------------
      // Start microphone
      // -------------------------------------------------------------

      const stream =
        await mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });

      localStreamRef.current = stream;

      // Proper Android call audio routing.
      try {
        InCallManager.start({
          media: "audio",
        });

        InCallManager.setForceSpeakerphoneOn(false);
      } catch {
        // WebRTC can still work even if call routing fails.
      }

      // -------------------------------------------------------------
      // Create owner-side peer connection
      // -------------------------------------------------------------

      const pc = new RTCPeerConnection(
        RTC_CONFIG as any,
      );

      pcRef.current = pc;
      const pcEvents = pc as any;
      stream.getTracks().forEach((track: any) => {
        pc.addTrack(track, stream);
      });

      // -------------------------------------------------------------
      // Send owner's ICE candidates to backend
      // -------------------------------------------------------------

      pcEvents.addEventListener("icecandidate", (event: any) => {
        if (!event.candidate) return;

        const candidate =
          typeof event.candidate.toJSON === "function"
            ? event.candidate.toJSON()
            : {
                candidate:
                  event.candidate.candidate,
                sdpMid:
                  event.candidate.sdpMid,
                sdpMLineIndex:
                  event.candidate.sdpMLineIndex,
              };

        sendCallCandidate(
          current.call_id,
          candidate,
        ).catch(() => {});
      });

      // -------------------------------------------------------------
      // Connection state
      // -------------------------------------------------------------

      pcEvents.addEventListener("connectionstatechange", () => {
        const state = String(
          pc.connectionState || "",
        );

        if (state === "connected") {
          setPhase("connected");
        }

        if (state === "failed") {
          hangup().catch(() => {});
        }
      });

     pcEvents.addEventListener("iceconnectionstatechange", () => {
        const state = String(
          pc.iceConnectionState || "",
        );

        if (
          state === "connected" ||
          state === "completed"
        ) {
          setPhase("connected");
        }

        if (state === "failed") {
          hangup().catch(() => {});
        }
      });

      // -------------------------------------------------------------
      // Wait for caller's SDP offer
      // -------------------------------------------------------------

      let details: Awaited<
        ReturnType<typeof getCallDetails>
      > | null = null;

      for (let i = 0; i < 12; i += 1) {
        details = await getCallDetails(
          current.call_id,
        );

        const status = String(
          details?.status || "",
        ).toLowerCase();

        if (
          ["ended", "rejected", "missed"].includes(
            status,
          )
        ) {
          finishCallLocally("Call ended");
          return;
        }

        if (details?.offer?.sdp) {
          break;
        }

        await sleep(600);
      }

      if (!details?.offer?.sdp) {
        throw new Error(
          "Caller SDP offer was not received",
        );
      }

      // -------------------------------------------------------------
      // Apply remote caller offer
      // -------------------------------------------------------------

      await pc.setRemoteDescription(
        new RTCSessionDescription(
          details.offer as any,
        ),
      );

      // Add any ICE candidates already received.
      await applyCallerCandidates(
        details.caller_candidates || [],
      );

      // -------------------------------------------------------------
      // Create owner's SDP answer
      // -------------------------------------------------------------

      const answer = await pc.createAnswer();

      await pc.setLocalDescription(answer);

      if (!answer.sdp) {
        throw new Error(
          "Failed to create SDP answer",
        );
      }

      // -------------------------------------------------------------
      // Send answer to backend
      // -------------------------------------------------------------

      await acceptCall(current.call_id, {
        type: "answer",
        sdp: answer.sdp,
      });

      // -------------------------------------------------------------
      // Keep polling caller ICE candidates
      // -------------------------------------------------------------

      startCandidatePolling(
        current.call_id,
      );
    } catch (error) {
      console.error(
        "WebRTC accept failed",
        error,
      );

      try {
        await endCall(current.call_id);
      } catch {
        // ignore
      }

      finishCallLocally();

      toast(
        "Could not connect the voice call. Please try again.",
        "error",
      );
    }
  };

  const toggleMute = () => {
    const nextMuted = !muted;

    try {
      localStreamRef.current
        ?.getAudioTracks?.()
        ?.forEach((track: any) => {
          track.enabled = !nextMuted;
        });
    } catch {
      // ignore
    }

    setMuted(nextMuted);
  };

  // Component unmount cleanup.
  useEffect(() => {
    return () => {
      cleanupPeer();
    };
  }, []);

  if (!call) return null;

  const avatar = Math.min(
    Math.max(width * 0.3, 96),
    148,
  );

  const ring = avatar * 1.55;
  const iconSize = avatar * 0.4;

  const btn = Math.min(
    Math.max(width * 0.36, 128),
    168,
  );

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });

  const glow = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.55],
  });

  const isRinging = phase === "ringing";

  const title =
    phase === "ringing"
      ? "Someone needs to reach you"
      : phase === "connecting"
        ? "Connecting voice call..."
        : "Voice call connected";

  const subtitle = isRinging
    ? `about ${
        call.number_plate
          ? `vehicle ${call.number_plate}`
          : "your tagged item"
      }`
    : phase === "connected"
      ? `${formatDuration(seconds)} · ${
          call.number_plate ||
          "NekSathi voice call"
        }`
      : call.number_plate
        ? `vehicle ${call.number_plate}`
        : "NekSathi secure voice call";

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (isRinging) {
          onDecline(call);
        } else {
          hangup();
        }
      }}
    >
      <View
        style={[
          styles.backdrop,
          {
            paddingTop:
              insets.top + spacing.xxl,
            paddingBottom:
              insets.bottom + spacing.xxl,
          },
        ]}
        testID="incoming-call-overlay"
      >
        <View style={styles.top}>
          <Text style={styles.tag}>
            NekSathi ·{" "}
            {isRinging
              ? "incoming call"
              : "secure voice call"}
          </Text>
        </View>

        <View style={styles.middle}>
          <View
            style={{
              width: ring,
              height: ring,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing.xl,
            }}
          >
            <Animated.View
              style={[
                styles.ringGlow,
                {
                  width: ring,
                  height: ring,
                  borderRadius: ring / 2,
                  opacity:
                    isRinging ? glow : 0.3,
                  transform: [
                    {
                      scale:
                        isRinging
                          ? scale
                          : 1,
                    },
                  ],
                },
              ]}
            />

            <View
              style={[
                styles.avatar,
                {
                  width: avatar,
                  height: avatar,
                  borderRadius: avatar / 2,
                },
              ]}
            >
              <Feather
                name={
                  isRinging
                    ? "phone-incoming"
                    : "phone-call"
                }
                size={iconSize}
                color={colors.bg}
              />
            </View>
          </View>

          <Text
            style={[
              styles.title,
              {
                fontSize: Math.min(
                  width * 0.07,
                  28,
                ),
              },
            ]}
            numberOfLines={2}
            adjustsFontSizeToFit
          >
            {title}
          </Text>

          <Text
            style={styles.sub}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        </View>

        {isRinging ? (
          <View
            style={[
              styles.actions,
              height < 640 && {
                gap: spacing.lg,
              },
            ]}
          >
            <Pressable
              style={styles.action}
              onPress={() =>
                onDecline(call)
              }
              testID="call-decline"
            >
              <View
                style={[
                  styles.circle,
                  styles.decline,
                  {
                    width: btn * 0.42,
                    height: btn * 0.42,
                    borderRadius:
                      btn * 0.21,
                  },
                ]}
              >
                <Feather
                  name="phone-off"
                  size={btn * 0.2}
                  color="#fff"
                />
              </View>

              <Text style={styles.btnText}>
                Decline
              </Text>
            </Pressable>

            <Pressable
              style={styles.action}
              onPress={() =>
                onAccept(call)
              }
              testID="call-accept"
            >
              <View
                style={[
                  styles.circle,
                  styles.accept,
                  {
                    width: btn * 0.42,
                    height: btn * 0.42,
                    borderRadius:
                      btn * 0.21,
                  },
                ]}
              >
                <Feather
                  name="phone-call"
                  size={btn * 0.2}
                  color="#04120c"
                />
              </View>

              <Text style={styles.btnText}>
                Accept
              </Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={[
              styles.actions,
              height < 640 && {
                gap: spacing.lg,
              },
            ]}
          >
            <Pressable
              style={styles.action}
              onPress={toggleMute}
              testID="call-mute"
            >
              <View
                style={[
                  styles.circle,
                  styles.mute,
                  {
                    width: btn * 0.42,
                    height: btn * 0.42,
                    borderRadius:
                      btn * 0.21,
                  },
                ]}
              >
                <Feather
                  name={
                    muted
                      ? "mic-off"
                      : "mic"
                  }
                  size={btn * 0.2}
                  color="#fff"
                />
              </View>

              <Text style={styles.btnText}>
                {muted ? "Unmute" : "Mute"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.action}
              onPress={hangup}
              testID="call-hangup"
            >
              <View
                style={[
                  styles.circle,
                  styles.decline,
                  {
                    width: btn * 0.42,
                    height: btn * 0.42,
                    borderRadius:
                      btn * 0.21,
                  },
                ]}
              >
                <Feather
                  name="phone-off"
                  size={btn * 0.2}
                  color="#fff"
                />
              </View>

              <Text style={styles.btnText}>
                End
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(4,4,12,0.97)",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
  },

  top: {
    alignItems: "center",
  },

  tag: {
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  middle: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },

  ringGlow: {
    position: "absolute",
    backgroundColor: colors.green,
  },

  avatar: {
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    color: colors.text,
    fontFamily: fonts.display,
    textAlign: "center",
  },

  sub: {
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    textAlign: "center",
    marginTop: spacing.xs,
  },

  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xxxl,
    width: "100%",
  },

  action: {
    alignItems: "center",
    gap: spacing.sm,
  },

  circle: {
    alignItems: "center",
    justifyContent: "center",
  },

  decline: {
    backgroundColor: colors.red,
  },

  accept: {
    backgroundColor: colors.green,
  },

  mute: {
    backgroundColor: "#28283a",
  },

  btnText: {
    color: colors.text,
    fontFamily: fonts.displaySemi,
    fontSize: fontSize.base,
  },
});