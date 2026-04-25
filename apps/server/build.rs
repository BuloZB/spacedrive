use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
	println!("cargo:rerun-if-changed=build.rs");
	println!("cargo:rerun-if-env-changed=SD_SKIP_WEB_BUILD");

	if env::var_os("SD_SKIP_WEB_BUILD").is_some() {
		println!("cargo:warning=SD_SKIP_WEB_BUILD set — using existing apps/web/dist");
		return;
	}

	// If bun isn't available (e.g., Docker Rust build stage), the caller is
	// expected to have prebuilt apps/web/dist. Skip silently.
	if Command::new("bun").arg("--version").output().is_err() {
		println!("cargo:warning=bun not found on PATH — using existing apps/web/dist");
		return;
	}

	let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
	let repo_root = manifest_dir
		.parent()
		.and_then(Path::parent)
		.expect("apps/server is two levels below the repo root")
		.to_path_buf();
	let web_dir = repo_root.join("apps/web");

	// Refuse to proceed if workspace dependencies aren't installed.
	if !repo_root.join("node_modules").exists() {
		panic!(
			"node_modules missing at {} — run `bun install` (or `just setup`) before building sd-server, \
			 or set SD_SKIP_WEB_BUILD=1 to skip the embedded UI build.",
			repo_root.display()
		);
	}

	// Invalidate the build script when any UI source or relevant config changes.
	// Cargo will cache this build script's output otherwise, so Rust-only changes
	// won't pay the cost of rebuilding the web bundle.
	watch_dir(&web_dir.join("src"));
	watch_dir(&repo_root.join("packages/interface/src"));
	watch_dir(&repo_root.join("packages/ts-client/src"));
	for path in [
		web_dir.join("index.html"),
		web_dir.join("vite.config.ts"),
		web_dir.join("package.json"),
		web_dir.join("tsconfig.json"),
		repo_root.join("packages/interface/package.json"),
		repo_root.join("packages/ts-client/package.json"),
	] {
		if path.exists() {
			rerun(&path);
		}
	}

	let status = Command::new("bun")
		.args(["run", "build"])
		.current_dir(&web_dir)
		.status()
		.expect("failed to spawn `bun run build`");

	if !status.success() {
		panic!(
			"`bun run build` in {} failed with status {}",
			web_dir.display(),
			status
		);
	}
}

fn watch_dir(dir: &Path) {
	if !dir.exists() {
		return;
	}
	let entries = match std::fs::read_dir(dir) {
		Ok(e) => e,
		Err(_) => return,
	};
	for entry in entries.flatten() {
		let path = entry.path();
		let file_type = match entry.file_type() {
			Ok(ft) => ft,
			Err(_) => continue,
		};
		if file_type.is_dir() {
			if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
				if matches!(name, "node_modules" | "dist" | ".turbo" | "build" | ".next") {
					continue;
				}
			}
			watch_dir(&path);
		} else if file_type.is_file() {
			rerun(&path);
		}
	}
}

fn rerun(path: &Path) {
	println!("cargo:rerun-if-changed={}", path.display());
}
