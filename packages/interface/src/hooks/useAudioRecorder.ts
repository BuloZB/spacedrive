import { useState, useRef, useCallback, useEffect } from "react";

export type RecordingState = "idle" | "recording" | "stopping";

interface UseAudioRecorderReturn {
	state: RecordingState;
	startRecording: () => Promise<void>;
	stopRecording: () => Promise<Blob | null>;
	/** Current audio level (0-1) for visualization. */
	audioLevel: number;
	/** Frequency-band levels (0-1) for spectral bar visualization. */
	spectrumLevels: number[];
}

const SPECTRUM_BAR_COUNT = 45;

function buildSpectrumLevels(
	frequencyData: Uint8Array,
	previousLevels: number[],
): number[] {
	return Array.from({ length: SPECTRUM_BAR_COUNT }, (_, index) => {
		const start = Math.floor((index * frequencyData.length) / SPECTRUM_BAR_COUNT);
		const end = Math.floor(((index + 1) * frequencyData.length) / SPECTRUM_BAR_COUNT);
		let sum = 0;
		for (let i = start; i < end; i += 1) {
			sum += frequencyData[i] ?? 0;
		}
		const binCount = Math.max(1, end - start);
		const average = sum / binCount / 255;
		const boosted = Math.min(1, average * 2.6);
		const previous = previousLevels[index] ?? 0;
		return previous * 0.55 + boosted * 0.45;
	});
}

/**
 * Hook for recording audio from the user's microphone via MediaRecorder.
 * Returns a WebM/Opus blob suitable for upload to Spacebot's /api/webchat/send-audio.
 */
export function useAudioRecorder(): UseAudioRecorderReturn {
	const [state, setState] = useState<RecordingState>("idle");
	const [audioLevel, setAudioLevel] = useState(0);
	const [spectrumLevels, setSpectrumLevels] = useState<number[]>(() =>
		Array.from({ length: SPECTRUM_BAR_COUNT }, () => 0),
	);

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const streamRef = useRef<MediaStream | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const animFrameRef = useRef<number>(0);
	const resolveStopRef = useRef<((blob: Blob | null) => void) | null>(null);
	const smoothedLevelRef = useRef(0);
	const noiseFloorRef = useRef(0.008);
	const smoothedSpectrumRef = useRef<number[]>(
		Array.from({ length: SPECTRUM_BAR_COUNT }, () => 0),
	);

	const cleanupAudioGraph = useCallback(() => {
		cancelAnimationFrame(animFrameRef.current);
		analyserRef.current = null;
		streamRef.current?.getTracks().forEach((track) => track.stop());
		streamRef.current = null;
		if (audioContextRef.current) {
			void audioContextRef.current.close();
			audioContextRef.current = null;
		}
		smoothedLevelRef.current = 0;
		noiseFloorRef.current = 0.008;
		setAudioLevel(0);
		smoothedSpectrumRef.current = Array.from({ length: SPECTRUM_BAR_COUNT }, () => 0);
		setSpectrumLevels(smoothedSpectrumRef.current);
	}, []);

	useEffect(() => {
		return () => {
			const recorder = mediaRecorderRef.current;
			mediaRecorderRef.current = null;
			if (recorder && recorder.state !== "inactive") {
				recorder.onstop = null;
				try {
					recorder.stop();
				} catch {
					// no-op
				}
			}
			resolveStopRef.current?.(null);
			resolveStopRef.current = null;
			cleanupAudioGraph();
		};
	}, [cleanupAudioGraph]);

	const startRecording = useCallback(async () => {
		if (state !== "idle") return;

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			});
			streamRef.current = stream;

			const audioContext = new AudioContext();
			audioContextRef.current = audioContext;
			if (audioContext.state === "suspended") {
				await audioContext.resume();
			}
			const source = audioContext.createMediaStreamSource(stream);
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 1024;
			analyser.smoothingTimeConstant = 0.82;
			source.connect(analyser);
			analyserRef.current = analyser;

			const dataArray = new Float32Array(analyser.fftSize);
			const frequencyData = new Uint8Array(analyser.frequencyBinCount);
			const updateLevel = () => {
				if (!analyserRef.current) return;
				analyser.getFloatTimeDomainData(dataArray);
				analyser.getByteFrequencyData(frequencyData);

				let sumSquares = 0;
				for (const sample of dataArray) {
					sumSquares += sample * sample;
				}
				const rms = Math.sqrt(sumSquares / dataArray.length);

				const noiseFloor = Math.min(
					0.03,
					noiseFloorRef.current * 0.995 + rms * 0.005,
				);
				noiseFloorRef.current = noiseFloor;

				const gated = Math.max(0, rms - noiseFloor * 1.35);
				const normalized = Math.min(1, gated * 12);
				const smoothed = smoothedLevelRef.current * 0.72 + normalized * 0.28;
				smoothedLevelRef.current = smoothed;
				setAudioLevel(smoothed);

				const nextSpectrum = buildSpectrumLevels(
					frequencyData,
					smoothedSpectrumRef.current,
				);
				smoothedSpectrumRef.current = nextSpectrum;
				setSpectrumLevels(nextSpectrum);
				animFrameRef.current = requestAnimationFrame(updateLevel);
			};
			updateLevel();

			const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
				? "audio/webm;codecs=opus"
				: "audio/webm";

			const recorder = new MediaRecorder(stream, { mimeType });
			chunksRef.current = [];

			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					chunksRef.current.push(event.data);
				}
			};

			recorder.onstop = () => {
				mediaRecorderRef.current = null;
				const blob = new Blob(chunksRef.current, { type: mimeType });
				chunksRef.current = [];
				cleanupAudioGraph();
				setState("idle");

				if (resolveStopRef.current) {
					resolveStopRef.current(blob);
					resolveStopRef.current = null;
				}
			};

			mediaRecorderRef.current = recorder;
			recorder.start(100);
			setState("recording");
		} catch (error) {
			console.error("Failed to start recording:", error);
			cleanupAudioGraph();
			setState("idle");
		}
	}, [cleanupAudioGraph, state]);

	const stopRecording = useCallback((): Promise<Blob | null> => {
		return new Promise((resolve) => {
			const recorder = mediaRecorderRef.current;
			if (!recorder || recorder.state !== "recording") {
				resolve(null);
				return;
			}

			setState("stopping");
			resolveStopRef.current = resolve;
			recorder.stop();
		});
	}, []);

	return { state, startRecording, stopRecording, audioLevel, spectrumLevels };
}
