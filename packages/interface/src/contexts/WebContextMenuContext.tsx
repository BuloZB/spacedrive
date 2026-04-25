import {
	createContext,
	useCallback,
	useContext,
	useState,
	type PropsWithChildren,
} from "react";
import { CaretRight } from "@phosphor-icons/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import type { ContextMenuItem } from "../hooks/useContextMenu";

interface MenuState {
	items: ContextMenuItem[];
	x: number;
	y: number;
}

interface WebContextMenuController {
	show: (items: ContextMenuItem[], x: number, y: number) => void;
	close: () => void;
}

const ControllerContext = createContext<WebContextMenuController | null>(null);

export function useWebContextMenuController(): WebContextMenuController | null {
	return useContext(ControllerContext);
}

export function WebContextMenuProvider({ children }: PropsWithChildren) {
	const [state, setState] = useState<MenuState | null>(null);

	const show = useCallback(
		(items: ContextMenuItem[], x: number, y: number) => {
			// If a menu is already open, close it first so Radix re-anchors
			// at the new cursor position on the next tick.
			setState(null);
			requestAnimationFrame(() => setState({ items, x, y }));
		},
		[],
	);

	const close = useCallback(() => setState(null), []);

	return (
		<ControllerContext.Provider value={{ show, close }}>
			{children}
			<WebContextMenu state={state} onClose={close} />
		</ControllerContext.Provider>
	);
}

function WebContextMenu({
	state,
	onClose,
}: {
	state: MenuState | null;
	onClose: () => void;
}) {
	return (
		<DropdownMenu.Root
			open={state !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DropdownMenu.Trigger asChild>
				<span
					aria-hidden
					style={{
						position: "fixed",
						left: state?.x ?? 0,
						top: state?.y ?? 0,
						width: 1,
						height: 1,
						pointerEvents: "none",
					}}
				/>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content
					className="bg-menu border-menu-line z-[100] min-w-[200px] rounded-lg border py-1 shadow-2xl"
					sideOffset={2}
					align="start"
					collisionPadding={8}
				>
					{state && renderItems(state.items)}
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

function renderItems(items: ContextMenuItem[]) {
	return items.map((item, index) => {
		const key = `${index}-${item.label ?? item.type ?? "item"}`;

		if (item.type === "separator") {
			return (
				<DropdownMenu.Separator
					key={key}
					className="bg-menu-line mx-1 my-1 h-px"
				/>
			);
		}

		if (item.submenu && item.submenu.length > 0) {
			return (
				<DropdownMenu.Sub key={key}>
					<DropdownMenu.SubTrigger
						disabled={item.disabled}
						className={menuItemClasses(item)}
					>
						<MenuItemInner item={item} />
						<CaretRight
							className="text-menu-faint ml-auto size-3 shrink-0"
							weight="bold"
						/>
					</DropdownMenu.SubTrigger>
					<DropdownMenu.Portal>
						<DropdownMenu.SubContent
							className="bg-menu border-menu-line z-[100] min-w-[200px] rounded-lg border py-1 shadow-2xl"
							sideOffset={4}
							alignOffset={-4}
						>
							{renderItems(item.submenu)}
						</DropdownMenu.SubContent>
					</DropdownMenu.Portal>
				</DropdownMenu.Sub>
			);
		}

		return (
			<DropdownMenu.Item
				key={key}
				disabled={item.disabled}
				onSelect={() => item.onClick?.()}
				className={menuItemClasses(item)}
			>
				<MenuItemInner item={item} />
			</DropdownMenu.Item>
		);
	});
}

function menuItemClasses(item: ContextMenuItem) {
	const variant = item.variant ?? "default";
	return clsx(
		"mx-1 flex items-center gap-2 rounded-md px-2 py-1 text-sm outline-none",
		variant === "danger" && "text-status-error",
		variant === "dull" && "text-menu-faint",
		variant === "default" && "text-menu-ink",
		item.disabled
			? "cursor-not-allowed opacity-50"
			: "data-[highlighted]:bg-menu-hover cursor-pointer",
	);
}

function MenuItemInner({ item }: { item: ContextMenuItem }) {
	const Icon = item.icon;
	return (
		<>
			{Icon ? <Icon className="size-4 shrink-0" weight="bold" /> : null}
			<span className="flex-1 truncate text-left">{item.label}</span>
			{item.keybind ? (
				<span className="text-menu-faint ml-2 text-xs">
					{item.keybind}
				</span>
			) : null}
		</>
	);
}
