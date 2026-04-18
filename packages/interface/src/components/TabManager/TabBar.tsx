import {
	horizontalListSortingStrategy,
	SortableContext,
	useSortable
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {Plus, X} from '@phosphor-icons/react';
import {TabBar as TabBarPrimitive, TabBarItem} from '@spacedrive/primitives';
import clsx from 'clsx';
import {useMemo} from 'react';
import type {Tab} from '.';
import {useTabManager} from './useTabManager';

interface SortableTabProps {
	tab: Tab;
	isActive: boolean;
	onSwitch: (tabId: string) => void;
	onClose: (tabId: string) => void;
}

function SortableTab({tab, isActive, onSwitch, onClose}: SortableTabProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging
	} = useSortable({
		id: tab.id,
		data: {
			type: 'tab',
			tabId: tab.id
		}
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition
	};

	return (
		<TabBarItem
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			label={tab.title}
			active={isActive}
			onClose={() => onClose(tab.id)}
			closeIcon={<X size={10} weight="bold" />}
			onClick={() => onSwitch(tab.id)}
			className={clsx(isDragging && 'z-50 opacity-50')}
		/>
	);
}

export function TabBar() {
	const {tabs, activeTabId, switchTab, closeTab, createTab} = useTabManager();

	// Ensure activeTabId exists in tabs array, fallback to first tab
	// Memoize to prevent unnecessary rerenders during rapid state updates
	const safeActiveTabId = useMemo(() => {
		return tabs.find((t) => t.id === activeTabId)?.id ?? tabs[0]?.id;
	}, [tabs, activeTabId]);

	// Don't show tab bar if only one tab
	if (tabs.length <= 1) {
		return null;
	}

	return (
		<TabBarPrimitive
			trailing={
				<button
					onClick={() => createTab()}
					className="hover:bg-app-hover text-ink-dull hover:text-ink flex size-7 shrink-0 items-center justify-center rounded-full transition-colors"
					title="New tab (⌘T)"
				>
					<Plus size={14} weight="bold" />
				</button>
			}
		>
			<SortableContext
				items={tabs.map((tab) => tab.id)}
				strategy={horizontalListSortingStrategy}
			>
				{tabs.map((tab) => (
					<SortableTab
						key={tab.id}
						tab={tab}
						isActive={tab.id === safeActiveTabId}
						onSwitch={switchTab}
						onClose={closeTab}
					/>
				))}
			</SortableContext>
		</TabBarPrimitive>
	);
}
