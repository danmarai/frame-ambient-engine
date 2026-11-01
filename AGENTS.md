# Frame development environment

The canonical active checkout is on Tuscany: /Users/dmarantz/ClaudeCode/FrameHomepage.
Run Android, Tizen, and primary dependency builds there, not on the laptop.
Source tools/studio-env.sh in build shells. Node 22, pnpm 9.15.4, JDK 17.
The laptop can run the lightweight LAN TV helper because the Frontier TV is on its network.
Never commit .env, certificates, TV tokens, generated databases, APK/WGT outputs, or private network inventories.
Preserve local modifications before switching branches. The October 31 recovery backup and stash are intentional.
Paid image generation stays disabled unless the user requests API billing and FRAME_ENABLE_API_GENERATION=true is set.
Use current official model documentation before changing generation models. Do not silently fall back to mock images when a requested provider is unavailable.
