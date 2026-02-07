# Tauri v2 Autoupdater Configuration

This document explains how to use the autoupdater in Spacedrive's Tauri app.

## Setup Completed

The following has been configured:

1. **Dependency Added**: `tauri-plugin-updater` added to `Cargo.toml`
2. **Bundle Configuration**: `createUpdaterArtifacts: true` enables update artifact generation
3. **Plugin Configuration**: Updater endpoint and public key configured in `tauri.conf.json`
4. **Permissions**: `updater:default` permission added to capabilities
5. **Plugin Initialization**: Updater plugin registered in `main.rs`

## Next Steps: Generate Signing Keys

Before building releases, you need to generate cryptographic signing keys:

```bash
cd apps/tauri
bun run tauri signer generate -- -w ~/.tauri/spacedrive.key
```

This creates two files:
- `~/.tauri/spacedrive.key` - **PRIVATE KEY** (keep secret, never commit)
- `~/.tauri/spacedrive.key.pub` - Public key for verification

### Update Configuration with Public Key

1. Copy the contents of `~/.tauri/spacedrive.key.pub`
2. Replace `REPLACE_WITH_PUBLIC_KEY_FROM_GENERATION` in `tauri.conf.json` with the public key

### Set Environment Variable for Builds

Before building releases, set the private key:

**macOS/Linux:**
```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/spacedrive.key)"
bun run tauri build
```

**Windows PowerShell:**
```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content ~/.tauri/spacedrive.key -Raw
bun run tauri build
```

**GitHub Actions:**
Add the private key as a secret and use it in your workflow:
```yaml
- name: Build with updater
  env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
  run: bun run tauri build
```

## Update Endpoint Configuration

The updater is configured to check:
```
https://releases.spacedrive.com/{{target}}/{{arch}}/{{current_version}}
```

Variables:
- `{{target}}` - OS name (`linux`, `windows`, `darwin`)
- `{{arch}}` - Architecture (`x86_64`, `aarch64`, `i686`, `armv7`)
- `{{current_version}}` - Current app version

### Expected Server Response

Your server should return JSON in one of these formats:

**No update available:**
```
HTTP 204 No Content
```

**Update available:**
```json
{
  "version": "2.0.1",
  "notes": "Bug fixes and performance improvements",
  "pub_date": "2026-01-25T00:00:00Z",
  "platforms": {
    "darwin-x86_64": {
      "signature": "[content of .sig file]",
      "url": "https://releases.spacedrive.com/Spacedrive_2.0.1_x64.app.tar.gz"
    },
    "darwin-aarch64": {
      "signature": "[content of .sig file]",
      "url": "https://releases.spacedrive.com/Spacedrive_2.0.1_aarch64.app.tar.gz"
    },
    "windows-x86_64": {
      "signature": "[content of .sig file]",
      "url": "https://releases.spacedrive.com/Spacedrive_2.0.1_x64-setup.nsis.zip"
    },
    "linux-x86_64": {
      "signature": "[content of .sig file]",
      "url": "https://releases.spacedrive.com/spacedrive_2.0.1_amd64.AppImage.tar.gz"
    }
  }
}
```

### Build Artifacts

After building with `createUpdaterArtifacts: true`, you'll find:

- **macOS**: `*.app.tar.gz` + `*.app.tar.gz.sig`
- **Windows**: `*-setup.nsis.zip` + `*-setup.nsis.zip.sig`
- **Linux**: `*.AppImage.tar.gz` + `*.AppImage.tar.gz.sig`

Upload these to your release server along with the JSON manifest.

## Usage Examples

### Frontend (TypeScript/JavaScript)

```typescript
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

async function checkForUpdates() {
  try {
    const update = await check();

    if (update === null) {
      console.log('App is up to date');
      return;
    }

    console.log(`Update available: ${update.version}`);
    console.log(`Release notes: ${update.body}`);

    // Download and install
    let downloaded = 0;
    let contentLength = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength;
          console.log(`Starting download of ${contentLength} bytes`);
          break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          console.log(`Downloaded ${downloaded}/${contentLength}`);
          break;
        case 'Finished':
          console.log('Download finished');
          break;
      }
    });

    console.log('Update installed, restarting app...');
    await relaunch();

  } catch (error) {
    console.error('Update check failed:', error);
  }
}

// Check on app startup
checkForUpdates();

// Or add a manual check button
document.getElementById('check-updates')?.addEventListener('click', checkForUpdates);
```

### Backend (Rust)

Add a Tauri command for manual update checks:

```rust
use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<String, String> {
    match app.updater()?.check().await {
        Ok(Some(update)) => {
            tracing::info!("Update available: {}", update.version);

            // Download and install
            update.download_and_install(
                |chunk_length, content_length| {
                    tracing::debug!("Downloaded {chunk_length} of {content_length:?}");
                },
                || tracing::info!("Download finished"),
            ).await
            .map_err(|e| format!("Failed to download update: {}", e))?;

            Ok(format!("Update to version {} installed", update.version))
        }
        Ok(None) => Ok("App is up to date".to_string()),
        Err(e) => Err(format!("Update check failed: {}", e)),
    }
}

// Register the command in main.rs
.invoke_handler(tauri::generate_handler![
    check_for_updates,
    // ... other commands
])
```

## Security Notes

- **Never commit** the private key (`~/.tauri/spacedrive.key`)
- Store the private key securely (password manager, CI secrets)
- The public key in `tauri.conf.json` is safe to commit
- Updates are cryptographically verified before installation
- Invalid signatures will be rejected

## Testing

1. Build with current version: `bun run tauri build`
2. Increment version in `tauri.conf.json` and `Cargo.toml`
3. Build again to create update artifacts
4. Set up a local server with the update manifest
5. Test the update flow

## GitHub Releases Integration

If using GitHub Releases, consider using the `tauri-action` workflow:

```yaml
- uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
  with:
    tagName: v__VERSION__
    releaseName: 'Spacedrive v__VERSION__'
    releaseBody: 'See the changelog for details'
    releaseDraft: true
    prerelease: false
```

This automatically:
- Builds for all platforms
- Signs the artifacts
- Creates GitHub release
- Uploads artifacts

Configure your endpoint to point to GitHub releases or use a CDN mirror.

## References

- [Official Tauri v2 Updater Plugin](https://v2.tauri.app/plugin/updater/)
- [Tauri GitHub Action](https://github.com/tauri-apps/tauri-action)
- [CrabNebula Cloud Guide](https://docs.crabnebula.dev/cloud/guides/auto-updates-tauri/)
