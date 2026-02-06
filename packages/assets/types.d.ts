// Type declarations for @sd/assets

declare module "@sd/assets/icons/*.png" {
	const value: number; // React Native uses numeric IDs for local images
	export default value;
}

declare module "@sd/assets/icons/*.jpg" {
	const value: number;
	export default value;
}

declare module "@sd/assets/images/*.png" {
	const value: number;
	export default value;
}

declare module "@sd/assets/images/*.jpg" {
	const value: number;
	export default value;
}

declare module "@sd/assets/svgs/*.svg" {
	import type { FC } from "react";
	const content: FC<Record<string, unknown>>;
	export default content;
}

declare module "@sd/assets/videos/*.mp4" {
	const value: number;
	export default value;
}

declare module "@sd/assets/sounds/*.mp3" {
	const value: number | string; // number on React Native (asset ID), string on web (URL)
	export default value;
}

declare module "@sd/assets/lottie/*.json" {
	const value: object;
	export default value;
}
