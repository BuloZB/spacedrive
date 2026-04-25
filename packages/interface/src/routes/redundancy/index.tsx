/**
 * Redundancy Dashboard
 *
 * Shows library-wide replication score, per-volume redundancy bars,
 * and an at-risk data callout.
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Warning, ArrowRight } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { TopBarPortal, TopBarItem } from "../../TopBar";
import { useLibraryQuery } from "../../contexts/SpacedriveContext";
import { RedundancyVolumeBar } from "./components/RedundancyVolumeBar";

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function RedundancyDashboard() {
	const navigate = useNavigate();

	const { data, isLoading } = useLibraryQuery({
		type: "redundancy.summary",
		input: {},
	});

	const scorePercent = useMemo(() => {
		if (!data) return 0;
		return Math.round(data.library_totals.replication_score * 100);
	}, [data]);

	const scoreColor =
		scorePercent >= 75
			? "text-status-success"
			: scorePercent >= 40
				? "text-status-warning"
				: "text-status-error";

	const topBarTitle = useMemo(
		() => (
			<div className="flex items-center gap-2">
				<ShieldCheck size={20} weight="bold" className="text-ink" />
				<h1 className="text-xl font-bold text-ink">Redundancy</h1>
			</div>
		),
		[],
	);

	if (isLoading || !data) {
		return (
			<>
				<TopBarPortal
					left={
						<TopBarItem
							id="redundancy-title"
							label="Redundancy"
							priority="high"
						>
							{topBarTitle}
						</TopBarItem>
					}
				/>
				<div className="flex h-full items-center justify-center text-ink-dull">
					Loading redundancy data...
				</div>
			</>
		);
	}

	const { library_totals, volumes } = data;
	const totalAtRiskFiles = volumes.reduce(
		(sum, v) => sum + v.at_risk_file_count,
		0,
	);

	return (
		<>
			<TopBarPortal
				left={
					<TopBarItem
						id="redundancy-title"
						label="Redundancy"
						priority="high"
					>
						{topBarTitle}
					</TopBarItem>
				}
			/>

			<div className="flex h-full flex-col overflow-hidden">
				<div className="flex-1 overflow-auto p-4 space-y-4">
					{/* Replication Score + At-Risk Summary */}
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{/* Replication Score Card */}
						<div className="flex items-center gap-4 rounded-lg border border-app-line bg-app-box/50 p-4">
							<div className="flex flex-col items-center">
								<motion.span
									className={`text-4xl font-bold ${scoreColor}`}
									initial={{ opacity: 0, scale: 0.5 }}
									animate={{ opacity: 1, scale: 1 }}
									transition={{ duration: 0.4 }}
								>
									{scorePercent}%
								</motion.span>
								<span className="text-xs text-ink-dull">
									Replication Score
								</span>
							</div>
							<div className="flex-1 space-y-1 text-xs text-ink-dull">
								<div>
									<span className="text-ink">
										{formatBytes(
											library_totals.total_redundant_bytes,
										)}
									</span>{" "}
									safely replicated
								</div>
								<div>
									<span className="text-ink">
										{formatBytes(
											library_totals.total_at_risk_bytes,
										)}
									</span>{" "}
									at risk (single copy)
								</div>
								<div>
									<span className="text-ink">
										{formatBytes(
											library_totals.total_unique_content_bytes,
										)}
									</span>{" "}
									unique content total
								</div>
							</div>
						</div>

						{/* At-Risk Callout */}
						<button
							onClick={() => navigate("/redundancy/at-risk")}
							className="flex items-center gap-4 rounded-lg border border-status-warning/30 bg-status-warning/5 p-4 text-left transition-colors hover:bg-status-warning/10"
						>
							<Warning
								size={32}
								weight="fill"
								className="flex-shrink-0 text-status-warning"
							/>
							<div className="flex-1">
								<div className="text-sm font-medium text-ink">
									{totalAtRiskFiles.toLocaleString()} files at
									risk
								</div>
								<div className="text-xs text-ink-dull">
									{formatBytes(
										library_totals.total_at_risk_bytes,
									)}{" "}
									of data exists on only one volume
								</div>
							</div>
							<ArrowRight
								size={16}
								className="flex-shrink-0 text-ink-dull"
							/>
						</button>
					</div>

					{/* Per-Volume Redundancy Bars */}
					<div>
						<h2 className="mb-2 text-sm font-medium text-ink-dull">
							Per-Volume Breakdown
						</h2>
						<div className="space-y-2">
							{volumes.length === 0 ? (
								<div className="rounded-lg border border-app-line bg-app-box/50 p-6 text-center text-sm text-ink-dull">
									No volumes with indexed content found.
									Index a volume to see redundancy data.
								</div>
							) : (
								volumes.map((vol) => (
									<RedundancyVolumeBar
										key={vol.volume_uuid}
										volumeUuid={vol.volume_uuid}
										displayName={vol.display_name}
										totalBytes={vol.total_bytes}
										atRiskBytes={vol.at_risk_bytes}
										atRiskFileCount={
											vol.at_risk_file_count
										}
										redundantBytes={vol.redundant_bytes}
										redundantFileCount={
											vol.redundant_file_count
										}
										totalFileCount={vol.total_file_count}
									/>
								))
							)}
						</div>
					</div>

					{/* Quick Actions */}
					<div className="flex gap-2">
						<button
							onClick={() => navigate("/redundancy/compare")}
							className="rounded-lg border border-app-line bg-app-box/50 px-4 py-2 text-sm text-ink transition-colors hover:bg-app-hover"
						>
							Compare Volumes
						</button>
						<button
							onClick={() => navigate("/redundancy/at-risk")}
							className="rounded-lg border border-app-line bg-app-box/50 px-4 py-2 text-sm text-ink transition-colors hover:bg-app-hover"
						>
							View At-Risk Files
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
