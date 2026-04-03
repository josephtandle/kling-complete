# Kling Complete MCP Server

Stop manually submitting video generation jobs. Generate AI videos from text or images, track generation status, and manage your entire Kling workflow, all from your AI assistant.

## What It Does

Kling Complete wraps the full Kling AI API as an MCP server, giving your AI assistant direct access to every Kling capability: text-to-video, image-to-video, video extensions, lip sync, virtual try-on, and account management.

## Tools

| Tool | Description |
|------|-------------|
| `create_text_to_video` | Generate a video from a text description. Example: "a cat playing piano on a rainy rooftop" |
| `list_text_to_video_tasks` | List all text-to-video generation tasks |
| `create_image_to_video` | Animate a still image into video. Provide an image URL and optional motion prompt |
| `list_image_to_video_tasks` | List all image-to-video tasks |
| `extend_video` | Extend a completed video by 4-5 more seconds |
| `list_video_extensions` | List all video extension tasks |
| `get_task_status` | Check the status of any task. Returns video URL when complete |
| `list_all_tasks` | List tasks by type across your account |
| `cancel_task` | Check current task status (Kling API does not support cancellation) |
| `get_account_info` | Retrieve your Kling account details |
| `get_credits_balance` | Check current credits balance and pricing reference |
| `lip_sync_video` | Sync a video's lip movements to a provided audio track |
| `virtual_try_on` | Apply clothing to a model image using Kling AI |

## Quick Start

### 1. Get your Kling API credentials

Visit [https://app.klingai.com/global/dev/api-key](https://app.klingai.com/global/dev/api-key) to get your API key and secret.

### 2. Run the server

```bash
KLING_API_KEY=your_key KLING_API_SECRET=your_secret node src/index.js
```

Or with a custom port:

```bash
PORT=3000 KLING_API_KEY=your_key KLING_API_SECRET=your_secret node src/index.js
```

### 3. Connect your MCP client

Point your MCP client to `http://localhost:8080/mcp`.

### 4. Generate your first video

Ask your AI assistant: "Generate a 5-second video of a golden retriever running through autumn leaves using Kling."

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `KLING_API_KEY` | Yes | Your Kling AI API access key |
| `KLING_API_SECRET` | No | Your Kling AI API secret (enables JWT auth, recommended) |
| `PORT` | No | Server port (default: 8080) |

## Pricing Reference

| Model | Cost per generation |
|-------|-------------------|
| kling-v3 | ~0.084-0.168 credits |
| kling-v2-master | ~0.21-1.68 credits |
| kling-v1-6 | ~0.28-1.40 credits |
| kling-v1 | ~0.14-0.98 credits |

## Health Check

```bash
curl http://localhost:8080/health
# {"status":"ok","server":"kling-complete","version":"1.0.0"}
```

---

Built with the [MCPize](https://mcpize.com) deployment platform.

Powered by [Mastermind HQ](https://mastermindshq.business) — AI automation for serious operators.
