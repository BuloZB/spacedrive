import React, {useState} from 'react';
import {View, Text, FlatList, Pressable} from 'react-native';
import {useJobs, type ExtendedJobListItem} from '../hooks/useJobs';

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getJobDisplayName(job: ExtendedJobListItem): string {
	if (job.name === 'indexer') return 'Indexing';
	if (job.name === 'thumbnail_generation') return 'Generating Thumbnails';

	// Parse action type if available
	if (job.action_context?.action_type) {
		const actionType = job.action_context.action_type;
		if (actionType === 'files.copy') return 'Copying Files';
		if (actionType === 'files.move') return 'Moving Files';
		if (actionType === 'files.delete') return 'Deleting Files';
	}

	return job.name
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

function getJobSubtext(job: ExtendedJobListItem): string {
	if (job.status_message) return job.status_message;
	if (job.current_phase) return job.current_phase;

	// Show progress info if available
	if (job.generic_progress?.completion) {
		const {completed, total, bytes_completed, total_bytes} =
			job.generic_progress.completion;
		if (bytes_completed && total_bytes) {
			return `${formatBytes(bytes_completed)} / ${formatBytes(total_bytes)}`;
		}
		if (completed && total) {
			return `${completed} / ${total} items`;
		}
	}

	return job.status;
}

interface JobCardProps {
	job: ExtendedJobListItem;
	onPause: (jobId: string) => Promise<void>;
	onResume: (jobId: string) => Promise<void>;
	onCancel: (jobId: string) => Promise<void>;
}

function JobCard({job, onPause, onResume, onCancel}: JobCardProps) {
	const isRunning = job.status === 'running';
	const isPaused = job.status === 'paused';
	const canControl = isRunning || isPaused;

	return (
		<View className="bg-app-box border border-app-line rounded-lg p-3 mb-2">
			<View className="flex-row items-start justify-between mb-2">
				<View className="flex-1 mr-2">
					<Text className="text-ink text-sm font-semibold" numberOfLines={1}>
						{getJobDisplayName(job)}
					</Text>
					<Text className="text-ink-dull text-xs mt-0.5" numberOfLines={1}>
						{getJobSubtext(job)}
					</Text>
				</View>

				{canControl && (
					<View className="flex-row gap-2">
						{isRunning && (
							<Pressable
								onPress={() => onPause(job.id)}
								className="bg-app-darkBox rounded-md px-2 py-1"
							>
								<Text className="text-ink-dull text-xs font-medium">Pause</Text>
							</Pressable>
						)}
						{isPaused && (
							<Pressable
								onPress={() => onResume(job.id)}
								className="bg-app-darkBox rounded-md px-2 py-1"
							>
								<Text className="text-accent text-xs font-medium">Resume</Text>
							</Pressable>
						)}
						<Pressable
							onPress={() => onCancel(job.id)}
							className="bg-app-darkBox rounded-md px-2 py-1"
						>
							<Text className="text-ink-dull text-xs font-medium">Cancel</Text>
						</Pressable>
					</View>
				)}
			</View>

			{/* Progress Bar */}
			{job.progress !== null && job.progress !== undefined && (
				<View className="bg-app-darkBox h-1.5 rounded-full overflow-hidden">
					<View
						className="bg-accent h-full rounded-full"
						style={{width: `${job.progress}%`}}
					/>
				</View>
			)}
		</View>
	);
}

export function JobManagerPanel() {
	const {jobs, activeJobCount, hasRunningJobs, pause, resume, cancel, isLoading} =
		useJobs();
	const [showAll, setShowAll] = useState(false);

	const activeJobs = jobs.filter(
		(j) => j.status === 'running' || j.status === 'paused'
	);
	const displayedJobs = showAll ? jobs : activeJobs;

	if (isLoading) {
		return (
			<View className="bg-app-box border border-app-line rounded-xl overflow-hidden mb-6">
				<View className="px-6 py-4 border-b border-app-line">
					<Text className="text-base font-semibold text-ink">Jobs</Text>
					<Text className="text-ink-dull text-sm mt-1">Loading jobs...</Text>
				</View>
			</View>
		);
	}

	// Don't show panel if no jobs
	if (jobs.length === 0) {
		return null;
	}

	return (
		<View className="bg-app-box border border-app-line rounded-xl overflow-hidden mb-6">
			{/* Header */}
			<View className="px-6 py-4 border-b border-app-line flex-row items-center justify-between">
				<View className="flex-row items-center gap-2">
					<Text className="text-base font-semibold text-ink">Jobs</Text>
					{activeJobCount > 0 && (
						<View className="bg-accent rounded-full px-2 py-0.5 min-w-[20px] items-center">
							<Text className="text-white text-[10px] font-bold">
								{activeJobCount}
							</Text>
						</View>
					)}
				</View>

				{jobs.length > activeJobCount && (
					<Pressable onPress={() => setShowAll(!showAll)}>
						<Text className="text-accent text-xs font-medium">
							{showAll ? 'Active Only' : 'Show All'}
						</Text>
					</Pressable>
				)}
			</View>

			{/* Job List */}
			<View className="px-3 py-3">
				{displayedJobs.length === 0 ? (
					<Text className="text-ink-faint text-center text-sm py-6">
						No active jobs
					</Text>
				) : (
					<FlatList
						data={displayedJobs}
						keyExtractor={(item) => item.id}
						renderItem={({item}) => (
							<JobCard
								job={item}
								onPause={pause}
								onResume={resume}
								onCancel={cancel}
							/>
						)}
						scrollEnabled={false}
					/>
				)}
			</View>
		</View>
	);
}
