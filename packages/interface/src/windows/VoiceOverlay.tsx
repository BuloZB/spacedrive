import {
	CaretDown,
	Microphone,
	SpeakerHigh,
	Stop,
} from "@phosphor-icons/react";
import { BallBlue } from "@sd/assets/images";
import { Popover, usePopover } from "@spacedrive/primitives";
import {
	apiClient,
	getEventsUrl,
	setServerUrl,
	type TtsProfile,
} from "@spacebot/api-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Orb from "../components/Orb";
import { usePlatform } from "../contexts/PlatformContext";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useTtsPlayback } from "../hooks/useTtsPlayback";
import { useSpacebotEventSource } from "../Spacebot/useSpacebotEventSource";

type VoiceState = "idle" | "recording" | "processing" | "speaking";

const OVERLAY_WINDOW_LABEL = "voice-overlay";
const OVERLAY_WIDTH = 520;
const SPACEBOT_URL = "http://127.0.0.1:19898";
const DEFAULT_AGENT_ID = "main";

interface SpokenResponseEvent {
	agent_id: string;
	channel_id: string;
	spoken_text: string;
	full_text: string;
}

function getVoiceSessionId(agentId: string) {
	return `portal:chat:${agentId}`;
}

// Initialize API client for the voice overlay window
setServerUrl(SPACEBOT_URL);

export function VoiceOverlay() {
	const platform = usePlatform();
	const profileSelector = usePopover();
	const containerRef = useRef<HTMLDivElement>(null);
	const [expanded, setExpanded] = useState(false);
	const [voiceState, setVoiceState] = useState<VoiceState>("idle");
	const [agentId] = useState(DEFAULT_AGENT_ID);
	const [profileId, setProfileId] = useState<string>(
		() => localStorage.getItem("spacedrive.voice.profileId") ?? "",
	);
	const [statusText, setStatusText] = useState(
		"Press Option+Shift+Space to talk",
	);
	const [transcript, setTranscript] = useState<
		Array<{ role: string; text: string }>
	>([]);
	const [profiles, setProfiles] = useState<TtsProfile[]>([]);
	const [profilesLoading, setProfilesLoading] = useState(false);
	const [profilesError, setProfilesError] = useState(false);

	const sessionId = getVoiceSessionId(agentId);

	const {
		state: recorderState,
		startRecording,
		stopRecording,
		audioLevel,
		spectrumLevels: recorderSpectrumLevels,
	} = useAudioRecorder();

	const {
		speak,
		stop: stopTts,
		playbackLevel,
		spectrumLevels: playbackSpectrumLevels,
	} = useTtsPlayback();

	const spokenReceivedRef = useRef(false);
	const ttsStartedRef = useRef(false);

	// -- Overlay window setup --
	useEffect(() => {
		document.documentElement.classList.add("overlay-window");
		document.body.classList.add("overlay-window");
		document.getElementById("root")?.classList.add("overlay-window");

		return () => {
			document.documentElement.classList.remove("overlay-window");
			document.body.classList.remove("overlay-window");
			document.getElementById("root")?.classList.remove("overlay-window");
		};
	}, []);

	// -- Resize overlay to fit content --
	useEffect(() => {
		if (!platform.resizeWindow) return;
		const element = containerRef.current;
		if (!element) return;

		const observer = new ResizeObserver((entries) => {
			const height =
				entries[0]?.borderBoxSize?.[0]?.blockSize ??
				entries[0]?.contentRect.height ??
				0;
			if (height > 0) {
				void platform.resizeWindow?.(
					OVERLAY_WINDOW_LABEL,
					OVERLAY_WIDTH,
					Math.ceil(height),
				);
			}
		});

		observer.observe(element);
		return () => observer.disconnect();
	}, [platform]);

	// -- Load Voicebox profiles --
	useEffect(() => {
		setProfilesLoading(true);
		apiClient
			.ttsProfiles(agentId)
			.then((data) => {
				setProfiles(data);
				setProfilesError(false);
				if (
					data.length > 0 &&
					(!profileId || !data.some((p) => p.id === profileId))
				) {
					const first = data[0]!.id;
					setProfileId(first);
					localStorage.setItem("spacedrive.voice.profileId", first);
				}
			})
			.catch(() => {
				setProfilesError(true);
			})
			.finally(() => {
				setProfilesLoading(false);
			});
	}, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

	// -- SSE: listen for spoken_response + outbound_message events --
	const voiceStateRef = useRef(voiceState);
	voiceStateRef.current = voiceState;

	const handleSpokenResponse = useCallback(
		(data: unknown) => {
			const event = data as SpokenResponseEvent;
			if (event.channel_id !== sessionId) return;

			spokenReceivedRef.current = true;
			if (ttsStartedRef.current) {
				setTranscript((prev) => [
					...prev,
					{ role: "assistant", text: event.full_text },
				]);
				return;
			}

			setVoiceState("speaking");
			setStatusText(event.spoken_text);
			setTranscript((prev) => [
				...prev,
				{ role: "assistant", text: event.full_text },
			]);

			ttsStartedRef.current = true;
			speak(event.spoken_text, agentId, profileId).then(() => {
				ttsStartedRef.current = false;
				setVoiceState("idle");
				setStatusText("Press Option+Shift+Space to talk");
			});
		},
		[sessionId, agentId, speak, profileId],
	);

	const handleOutboundMessage = useCallback(
		(data: unknown) => {
			const event = data as {
				agent_id: string;
				channel_id: string;
				text: string;
			};
			if (event.channel_id !== sessionId) return;

			if (voiceStateRef.current === "processing") {
				setStatusText(
					event.text.slice(0, 120) +
						(event.text.length > 120 ? "..." : ""),
				);

				// If no spoken_response comes, fall back to speaking the full message
				if (!spokenReceivedRef.current && !ttsStartedRef.current) {
					setTranscript((prev) => [
						...prev,
						{ role: "assistant", text: event.text },
					]);
					setVoiceState("speaking");
					ttsStartedRef.current = true;
					speak(event.text, agentId, profileId).then(() => {
						ttsStartedRef.current = false;
						setVoiceState("idle");
						setStatusText("Press Option+Shift+Space to talk");
					});
				}
			}
		},
		[sessionId, agentId, speak, profileId],
	);

	const handleTypingState = useCallback(
		(data: unknown) => {
			const event = data as {
				channel_id: string;
				is_typing: boolean;
			};
			if (event.channel_id !== sessionId) return;

			if (event.is_typing && voiceStateRef.current === "processing") {
				setStatusText("Thinking...");
			}
		},
		[sessionId],
	);

	useSpacebotEventSource(getEventsUrl(), {
		handlers: useMemo(
			() => ({
				spoken_response: handleSpokenResponse,
				outbound_message: handleOutboundMessage,
				typing_state: handleTypingState,
			}),
			[handleSpokenResponse, handleOutboundMessage, handleTypingState],
		),
		enabled: true,
	});

	// -- Recording flow --
	const handleStartRecording = useCallback(async () => {
		if (voiceState !== "idle") return;
		stopTts();
		setVoiceState("recording");
		setStatusText("Listening...");
		spokenReceivedRef.current = false;
		ttsStartedRef.current = false;
		await startRecording();
	}, [voiceState, startRecording, stopTts]);

	const handleStopRecording = useCallback(async () => {
		if (recorderState !== "recording") return;
		setVoiceState("processing");
		setStatusText("Processing...");

		const blob = await stopRecording();
		if (!blob || blob.size === 0) {
			setVoiceState("idle");
			setStatusText("Press Option+Shift+Space to talk");
			return;
		}

		setTranscript((prev) => [...prev, { role: "user", text: "[voice message]" }]);

		try {
			const response = await apiClient.webChatSendAudio(
				agentId,
				sessionId,
				blob,
			);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			// Now waiting for SSE events (typing_state, outbound_message, spoken_response)
		} catch (error) {
			console.error("Failed to send audio:", error);
			setVoiceState("idle");
			setStatusText("Failed to send. Try again.");
			setTimeout(
				() => setStatusText("Press Option+Shift+Space to talk"),
				3000,
			);
		}
	}, [recorderState, stopRecording, agentId, sessionId]);

	// -- Keyboard shortcut --
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.code === "Space" &&
				event.altKey &&
				event.shiftKey &&
				voiceState === "idle"
			) {
				event.preventDefault();
				void handleStartRecording();
			}
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			if (
				event.code === "Space" &&
				event.altKey &&
				event.shiftKey &&
				voiceState === "recording"
			) {
				event.preventDefault();
				void handleStopRecording();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
		};
	}, [voiceState, handleStartRecording, handleStopRecording]);

	// -- Derived visualization values --
	const activeEnergy =
		voiceState === "recording"
			? audioLevel
			: voiceState === "speaking"
				? playbackLevel
				: 0;

	const activeSpectrumLevels =
		voiceState === "recording"
			? recorderSpectrumLevels
			: voiceState === "speaking"
				? playbackSpectrumLevels
				: Array.from({ length: 45 }, () => 0);

	const waveColor =
		voiceState === "recording"
			? "#70b8ff"
			: voiceState === "speaking"
				? "#ba5cf6"
				: "#6b7280";

	const haloStyle =
		voiceState === "recording"
			? {
					background: `radial-gradient(circle, rgba(88,166,255,${0.18 + audioLevel * 0.28}) 0%, rgba(88,166,255,${0.08 + audioLevel * 0.12}) 34%, transparent 72%)`,
					transform: `scale(${1 + audioLevel * 0.16})`,
				}
			: voiceState === "speaking"
				? {
						background: `radial-gradient(circle, rgba(186,92,246,${0.16 + playbackLevel * 0.3}) 0%, rgba(186,92,246,${0.06 + playbackLevel * 0.14}) 34%, transparent 72%)`,
						transform: `scale(${1 + playbackLevel * 0.18})`,
					}
				: {
						background:
							"radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 34%, transparent 72%)",
						transform: "scale(1)",
					};

	return (
		<div
			ref={containerRef}
			className="flex w-screen flex-col items-center justify-end select-none"
			style={{ background: "transparent" }}
		>
			{/* Expanded transcript area */}
			{expanded && (
				<div className="mb-2 w-full max-w-[500px] overflow-hidden rounded-2xl border border-white/10 bg-app/95 shadow-2xl backdrop-blur-xl">
					<div className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-2.5">
						<div className="flex items-center gap-2">
							<div className="h-3 w-3 rounded-full bg-accent" />
							<span className="text-xs font-medium text-ink">
								Spacebot
							</span>
						</div>
						<div className="flex min-w-0 items-center gap-2">
							{profiles.length > 0 ? (
								<div className="w-[160px]">
									<Popover.Root
										open={profileSelector.open}
										onOpenChange={profileSelector.setOpen}
									>
										<Popover.Trigger asChild>
											<button className="flex h-8 w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-left text-[11px] font-medium text-ink-dull transition-colors hover:bg-white/10 hover:text-ink">
												<span className="flex-1 truncate text-left">
													{profiles.find(
														(p) =>
															p.id === profileId,
													)?.name ??
														profileId.slice(0, 8) ??
														"Select voice"}
												</span>
												<CaretDown
													className="size-3"
													weight="bold"
												/>
											</button>
										</Popover.Trigger>
										<Popover.Content
											align="end"
											sideOffset={8}
											className="p-2"
										>
											<div className="space-y-1">
												{profiles.map((p) => (
													<button
														key={p.id}
														onClick={() => {
															setProfileId(p.id);
															localStorage.setItem(
																"spacedrive.voice.profileId",
																p.id,
															);
															profileSelector.setOpen(
																false,
															);
														}}
														className="w-full rounded-md px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-app-selected"
													>
														{p.name ?? p.id.slice(0, 8)}
													</button>
												))}
											</div>
										</Popover.Content>
									</Popover.Root>
								</div>
							) : profilesLoading ? (
								<span className="text-[11px] text-ink-faint">
									Loading voices...
								</span>
							) : null}
							<button
								onClick={() => setExpanded(false)}
								className="text-[11px] text-ink-faint transition-colors hover:text-ink"
							>
								Collapse
							</button>
						</div>
					</div>

					{profilesError && (
						<div className="border-b border-white/5 px-4 py-2 text-[11px] text-amber-300/80">
							Couldn&apos;t load Voicebox profiles. Make sure
							Voicebox is running on port 17493.
						</div>
					)}

					<div className="max-h-[300px] overflow-y-auto p-4">
						{transcript.length === 0 ? (
							<p className="text-center text-xs text-ink-faint">
								Your conversation will appear here.
							</p>
						) : (
							<div className="flex flex-col gap-3">
								{transcript.map((entry, index) => (
									<div
										key={`${entry.role}-${index}`}
										className="flex flex-col gap-0.5"
									>
										<span className="text-[11px] font-medium text-ink-faint">
											{entry.role === "user"
												? "You"
												: "Spacebot"}
										</span>
										<p className="whitespace-pre-wrap text-xs leading-relaxed text-ink">
											{entry.text}
										</p>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{/* Pill */}
			<div
				className={`voice-overlay-pill relative mb-2 flex w-full max-w-[460px] cursor-pointer items-center gap-2.5 overflow-hidden rounded-[20px] border px-3 py-2 shadow-2xl backdrop-blur-xl transition-all ${
					voiceState === "recording"
						? "border-sky-300/35 bg-sky-400/10"
						: voiceState === "speaking"
							? "border-violet-300/35 bg-violet-400/10"
							: "border-white/10 bg-app/95"
				}`}
				data-tauri-drag-region
				onClick={() => {
					if (voiceState === "idle") setExpanded((v) => !v);
				}}
			>
				<div
					className="pointer-events-none absolute inset-x-5 -bottom-5 -top-5 rounded-full blur-2xl transition-all duration-200"
					style={haloStyle}
				/>

				<div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center">
					<div
						className={`absolute inset-0 transition-all duration-150 ${
							voiceState === "recording"
								? "bg-sky-400/12"
								: voiceState === "speaking"
									? "bg-violet-400/12"
									: "bg-transparent"
						}`}
						style={{
							transform: `scale(${1 + activeEnergy * 0.22})`,
						}}
					/>
					<div className="relative z-10 flex h-7 w-7 items-center justify-center text-ink">
						<BullLogoOrb />
					</div>
				</div>

				<div className="relative z-10 flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex items-center">
						<span
							className={`rounded-full py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] ${
								voiceState === "recording"
									? "bg-sky-400/14 text-sky-200"
									: voiceState === "speaking"
										? "bg-violet-400/14 text-violet-200"
										: voiceState === "processing"
											? "bg-violet-400/14 text-violet-200"
											: "bg-white/6 text-ink-faint"
							}`}
						>
							{voiceState === "recording"
								? "Input live"
								: voiceState === "speaking"
									? "Reply live"
									: voiceState === "processing"
										? "Thinking"
										: "Voice ready"}
						</span>
					</div>
					<p
						className={`min-w-0 truncate text-[12px] leading-tight ${voiceState === "idle" ? "text-ink-faint" : "text-ink"}`}
					>
						{statusText}
					</p>
					<div className="relative z-10 h-9 overflow-hidden px-1">
						<SiriWaveform
							levels={activeSpectrumLevels}
							energy={activeEnergy}
							color={waveColor}
							active={
								voiceState === "recording" ||
								voiceState === "speaking"
							}
						/>
					</div>
				</div>

				<button
					onClick={(event) => {
						event.stopPropagation();
						if (voiceState === "idle") void handleStartRecording();
						else if (voiceState === "speaking") stopTts();
					}}
					className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
						voiceState === "idle"
							? "border-white/10 bg-white/5 text-ink-faint hover:bg-white/10 hover:text-ink"
							: voiceState === "processing"
								? "animate-pulse border-violet-300/30 bg-violet-400/15 text-violet-100"
								: voiceState === "speaking"
									? "border-violet-300/30 bg-violet-400/15 text-violet-100"
									: "border-sky-300/30 bg-sky-400/15 text-sky-100"
					}`}
				>
					{voiceState === "speaking" ? (
						<SpeakerHigh className="size-4" weight="fill" />
					) : (
						<Microphone className="size-4" weight="fill" />
					)}
				</button>

				{voiceState === "recording" && (
					<button
						onClick={(event) => {
							event.stopPropagation();
							void handleStopRecording();
						}}
						className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-sky-300/30 bg-sky-400/15 text-sky-100 transition-colors hover:bg-sky-400/20"
					>
						<Stop className="size-4" weight="fill" />
					</button>
				)}
			</div>
		</div>
	);
}

function BullLogoOrb() {
	return (
		<>
			<div
				className="absolute inset-[calc(5%-2px)] z-0"
				aria-hidden="true"
			>
				<img
					src={BallBlue}
					alt=""
					className="h-full w-full object-contain"
					draggable={false}
				/>
			</div>
			<div className="absolute inset-0 z-10" aria-hidden="true">
				<Orb
					palette="blue"
					hue={0}
					hoverIntensity={0}
					rotateOnHover={false}
					forceHoverState
				/>
			</div>
		</>
	);
}

function SiriWaveform({
	levels,
	energy,
	color,
	active,
}: {
	levels: number[];
	energy: number;
	color: string;
	active: boolean;
}) {
	const width = 280;
	const height = 36;
	const centerY = height / 2;

	const smoothedLevels = useMemo(() => {
		if (levels.length === 0) {
			return Array.from({ length: 24 }, () => 0);
		}
		const bucketCount = 24;
		return Array.from({ length: bucketCount }, (_, bucketIndex) => {
			const start = Math.floor(
				(bucketIndex / bucketCount) * levels.length,
			);
			const end = Math.max(
				start + 1,
				Math.floor(((bucketIndex + 1) / bucketCount) * levels.length),
			);
			const slice = levels.slice(start, end);
			const average =
				slice.reduce((sum, value) => sum + value, 0) / slice.length;
			return Math.min(1, average);
		});
	}, [levels]);

	const wavePaths = useMemo(() => {
		const makePath = (
			phase: number,
			amplitudeBoost: number,
			frequency: number,
			drift: number,
		) => {
			const sampleCount = 88;
			const points = Array.from(
				{ length: sampleCount + 1 },
				(_, index) => {
					const progress = index / sampleCount;
					const x = progress * width;
					const levelIndex = Math.min(
						smoothedLevels.length - 1,
						Math.floor(progress * smoothedLevels.length),
					);
					const fft = smoothedLevels[levelIndex] ?? 0;
					const envelope = Math.pow(
						Math.sin(progress * Math.PI),
						1.35,
					);
					const neighboringLevel =
						smoothedLevels[
							Math.min(
								smoothedLevels.length - 1,
								levelIndex + 1,
							)
						] ?? fft;
					const blendedFft = fft * 0.65 + neighboringLevel * 0.35;
					const baseAmplitude = active
						? 3.2 +
							energy * 9.5 +
							blendedFft * 12.5 * amplitudeBoost
						: 1.35;
					const primary = Math.sin(
						progress * Math.PI * frequency + phase,
					);
					const secondary =
						Math.sin(
							progress * Math.PI * (frequency * 0.52) - drift,
						) * 0.4;
					const tertiary =
						Math.cos(
							progress * Math.PI * (frequency * 0.24) +
								phase * 0.35,
						) * 0.18;
					const y =
						centerY -
						(primary + secondary + tertiary) *
							baseAmplitude *
							envelope;
					return { x, y };
				},
			);

			return points.reduce((path, point, index, array) => {
				if (index === 0) {
					return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
				}
				const previous = array[index - 1]!;
				const controlX = ((previous.x + point.x) / 2).toFixed(2);
				const controlY = ((previous.y + point.y) / 2).toFixed(2);
				return `${path} Q ${previous.x.toFixed(2)} ${previous.y.toFixed(2)}, ${controlX} ${controlY}`;
			}, "");
		};

		const layerColors = buildWaveLayerColors(color);

		return [
			{
				path: makePath(0.1, 1.28, 3.15, 0.55),
				opacity: active ? 0.96 : 0.28,
				strokeWidth: 2.9,
				color: layerColors[0],
			},
			{
				path: makePath(0.9, 1.08, 2.7, 1.1),
				opacity: active ? 0.82 : 0.22,
				strokeWidth: 2.55,
				color: layerColors[1],
			},
			{
				path: makePath(1.7, 0.9, 2.2, 1.7),
				opacity: active ? 0.64 : 0.18,
				strokeWidth: 2.15,
				color: layerColors[2],
			},
			{
				path: makePath(2.45, 0.74, 1.75, 2.15),
				opacity: active ? 0.46 : 0.14,
				strokeWidth: 1.85,
				color: layerColors[3],
			},
			{
				path: makePath(3.2, 0.58, 1.3, 2.7),
				opacity: active ? 0.3 : 0.1,
				strokeWidth: 1.5,
				color: layerColors[4],
			},
		];
	}, [active, centerY, color, energy, smoothedLevels, width]);

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className="h-full w-full"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<path
				d={`M 0 ${centerY} L ${width} ${centerY}`}
				stroke={color}
				strokeOpacity={active ? 0.14 : 0.08}
				strokeWidth="1"
			/>
			{wavePaths.map((wave, index) => (
				<path
					key={index}
					d={wave.path}
					fill="none"
					stroke={wave.color}
					strokeWidth={wave.strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					opacity={wave.opacity}
				/>
			))}
		</svg>
	);
}

function buildWaveLayerColors(baseColor: string) {
	return [
		mixHex(baseColor, "#ffffff", 0.28),
		mixHex(baseColor, "#ffffff", 0.14),
		baseColor,
		mixHex(baseColor, "#0b1020", 0.16),
		mixHex(baseColor, "#0b1020", 0.28),
	];
}

function mixHex(colorA: string, colorB: string, amount: number) {
	const from = hexToRgb(colorA);
	const to = hexToRgb(colorB);
	const mix = (a: number, b: number) => Math.round(a + (b - a) * amount);
	return `rgb(${mix(from.r, to.r)}, ${mix(from.g, to.g)}, ${mix(from.b, to.b)})`;
}

function hexToRgb(hex: string) {
	const normalized = hex.replace("#", "");
	const value =
		normalized.length === 3
			? normalized
					.split("")
					.map((c) => c + c)
					.join("")
			: normalized;
	const parsed = Number.parseInt(value, 16);
	return {
		r: (parsed >> 16) & 255,
		g: (parsed >> 8) & 255,
		b: parsed & 255,
	};
}
