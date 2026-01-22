import {useJobs as useJobsCore, type UseJobsReturn} from '@sd/ts-client';
// TODO: Add native notifications when jobs complete
// import * as Notifications from 'expo-notifications';

/**
 * Mobile-specific wrapper around useJobs that adds:
 * - Native notification system (TODO)
 * - Mobile-specific job handling
 */
export function useJobs(): UseJobsReturn {
	const jobs = useJobsCore({
		onJobCompleted: (jobId, jobType) => {
			// TODO: Show native notification
			// Notifications.scheduleNotificationAsync({
			//   content: {
			//     title: 'Job Completed',
			//     body: `${jobType} finished successfully`,
			//   },
			//   trigger: null,
			// });
		},
		onJobFailed: (jobId) => {
			// TODO: Show error notification
			// Notifications.scheduleNotificationAsync({
			//   content: {
			//     title: 'Job Failed',
			//     body: 'A background task encountered an error',
			//   },
			//   trigger: null,
			// });
		}
	});

	return jobs;
}

// Re-export types for convenience
export type {SpeedSample, ExtendedJobListItem, GenericProgress} from '@sd/ts-client';
