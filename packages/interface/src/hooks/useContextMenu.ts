import { useCallback, useState } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { usePlatform } from '../contexts/PlatformContext';
import { useWebContextMenuController } from '../contexts/WebContextMenuContext';
import type { KeybindId } from '../util/keybinds/registry';
import { getKeybind } from '../util/keybinds/registry';
import { getComboForPlatform, getCurrentPlatform, toDisplayString } from '../util/keybinds/platform';

export interface ContextMenuItem {
	type?: 'separator' | 'submenu';
	icon?: Icon;
	label?: string;
	onClick?: () => void;
	/** Legacy: manual keybind display string */
	keybind?: string;
	/** Type-safe keybind ID - automatically resolves to platform-specific display string */
	keybindId?: KeybindId;
	variant?: 'default' | 'dull' | 'danger';
	disabled?: boolean;
	condition?: () => boolean;
	submenu?: ContextMenuItem[];
}

export interface ContextMenuConfig {
	items: ContextMenuItem[];
}

export interface ContextMenuResult {
	show: (e: React.MouseEvent) => Promise<void>;
	menuData: ContextMenuItem[] | null;
	closeMenu: () => void;
}

/**
 * Resolve keybind display string for a menu item
 */
function resolveKeybindDisplay(item: ContextMenuItem): string | undefined {
	// If explicit keybind string is provided, use it
	if (item.keybind) return item.keybind;

	// If keybindId is provided, resolve to display string
	if (item.keybindId) {
		const keybind = getKeybind(item.keybindId);
		if (keybind) {
			const platform = getCurrentPlatform();
			const combo = getComboForPlatform(keybind.combo, platform);
			return toDisplayString(combo, platform);
		}
	}

	return undefined;
}

/**
 * Drop leading/trailing separators and merge runs of adjacent separators into
 * one. Condition-based filtering can leave orphaned separators behind; this
 * keeps the rendered menu from looking broken. Recurses into submenus.
 */
function collapseSeparators(items: ContextMenuItem[]): ContextMenuItem[] {
	const result: ContextMenuItem[] = [];
	for (const item of items) {
		if (item.type === 'separator') {
			if (result.length === 0) continue;
			if (result[result.length - 1].type === 'separator') continue;
			result.push(item);
		} else if (item.submenu) {
			result.push({ ...item, submenu: collapseSeparators(item.submenu) });
		} else {
			result.push(item);
		}
	}
	while (result.length > 0 && result[result.length - 1].type === 'separator') {
		result.pop();
	}
	return result;
}

/**
 * Process menu items to resolve keybindId to display strings
 */
function processMenuItems(items: ContextMenuItem[]): ContextMenuItem[] {
	return items.map(item => {
		const processed = { ...item };

		// Resolve keybind display string
		const keybindDisplay = resolveKeybindDisplay(item);
		if (keybindDisplay) {
			processed.keybind = keybindDisplay;
		}

		// Process submenu items recursively
		if (item.submenu) {
			processed.submenu = processMenuItems(item.submenu);
		}

		return processed;
	});
}

/**
 * Hook for creating context menus that work both natively (Tauri) and in web
 *
 * This hook is platform-agnostic. Menu items are defined once in React,
 * and the platform adapter (Tauri or Web) handles the rendering.
 *
 * Usage:
 * ```tsx
 * const contextMenu = useContextMenu({
 *   items: [
 *     {
 *       icon: Copy,
 *       label: "Copy",
 *       onClick: () => copyItems(),
 *       keybindId: 'explorer.copy', // Auto-resolves to "⌘C" on macOS
 *       condition: () => selectedItems.length > 0
 *     },
 *     { type: "separator" },
 *     {
 *       label: "Delete",
 *       icon: Trash,
 *       onClick: () => deleteItems(),
 *       keybindId: 'explorer.delete', // Auto-resolves to platform-specific
 *       variant: "danger"
 *     }
 *   ]
 * });
 *
 * return <div onContextMenu={contextMenu.show}>Content</div>;
 * ```
 */
export function useContextMenu(config: ContextMenuConfig): ContextMenuResult {
	const [menuData, setMenuData] = useState<ContextMenuItem[] | null>(null);
	const platform = usePlatform();
	const webController = useWebContextMenuController();

	const show = useCallback(
		async (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const filteredItems = config.items.filter(
				(item) => !item.condition || item.condition()
			);
			const visibleItems = collapseSeparators(processMenuItems(filteredItems));

			const isTauri = platform.platform === 'tauri';
			const nativeShow = (window as any).__SPACEDRIVE__?.showContextMenu;

			if (isTauri && nativeShow) {
				try {
					await nativeShow(visibleItems, { x: e.clientX, y: e.clientY });
					return;
				} catch (err) {
					console.error('[useContextMenu] native menu failed, falling back to web', err);
				}
			}

			if (webController) {
				webController.show(visibleItems, e.clientX, e.clientY);
			} else {
				setMenuData(visibleItems);
			}
		},
		[config.items, platform, webController]
	);

	const closeMenu = useCallback(() => {
		setMenuData(null);
		webController?.close();
	}, [webController]);

	return { show, menuData, closeMenu };
}