/**
 * Kling Complete — MCP Server
 *
 * Complete wrapper for Kling AI video generation platform.
 * Supports text-to-video, image-to-video, video extensions,
 * task management, account info, lip sync, and virtual try-on.
 *
 * Transport: StreamableHTTPServerTransport on PORT 8080 (configurable via PORT env)
 * Auth: JWT generated from KLING_API_KEY + KLING_API_SECRET
 */

'use strict';

const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

// -- Config -----------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '8080', 10);
const API_BASE = 'https://api.klingai.com/v1';

const KLING_API_KEY = process.env.KLING_API_KEY || process.env.KLING_ACCESS_KEY;
const KLING_API_SECRET = process.env.KLING_API_SECRET || process.env.KLING_SECRET_KEY;

// -- Auth -------------------------------------------------------------------------

/**
 * Generate a JWT token for Kling API authentication.
 * Kling uses HS256 JWT with access_key as issuer and secret_key to sign.
 */
function generateJWT() {
  if (!KLING_API_KEY) {
    throw new Error('KLING_API_KEY environment variable is required');
  }

  // If no secret is set, fall back to basic base64 auth
  if (!KLING_API_SECRET) {
    return Buffer.from(`${KLING_API_KEY}:`).toString('base64');
  }

  const payload = {
    iss: KLING_API_KEY,
    exp: Math.floor(Date.now() / 1000) + 1800, // 30-minute expiry
    nbf: Math.floor(Date.now() / 1000) - 5,
  };

  return jwt.sign(payload, KLING_API_SECRET, {
    algorithm: 'HS256',
    header: { alg: 'HS256', typ: 'JWT' },
  });
}

// -- HTTP client ------------------------------------------------------------------

async function apiRequest(endpoint, method = 'GET', body = null) {
  const token = generateJWT();

  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body !== null) {
    opts.body = JSON.stringify(body);
  }

  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, opts);

  let data;
  try {
    data = await res.json();
  } catch {
    data = { error: await res.text() };
  }

  if (!res.ok) {
    throw new Error(`Kling API error ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

// -- MCP Server -------------------------------------------------------------------

const server = new McpServer({
  name: 'kling-complete',
  version: '1.0.0',
});

// -- Tools: Text-to-Video ---------------------------------------------------------

server.tool(
  'create_text_to_video',
  'Generate an AI video from a text description using Kling. Example: create a 5-second video of a cat playing piano on a rainy rooftop at night. Supports multiple models (kling-v1, kling-v1-6, kling-v2-master, kling-v3) and aspect ratios.',
  {
    prompt: z.string().min(1).describe('Text description of the video to generate. Be specific and descriptive for best results. Example: "A golden retriever running through autumn leaves in slow motion"'),
    model: z.enum(['kling-v1', 'kling-v1-6', 'kling-v2-master', 'kling-v3', 'kling-v3-omni']).optional().default('kling-v3').describe('Model to use. kling-v3 is the latest and recommended. kling-v2-master offers higher quality. kling-v1 is fastest.'),
    duration: z.enum(['5', '10']).optional().default('5').describe('Video duration in seconds. Either 5 or 10 seconds.'),
    aspect_ratio: z.enum(['16:9', '9:16', '1:1']).optional().default('16:9').describe('Video aspect ratio. Use 16:9 for landscape (YouTube/Twitter), 9:16 for vertical (TikTok/Reels), 1:1 for square.'),
    negative_prompt: z.string().optional().describe('Elements to avoid in the video. Example: "blurry, low quality, distorted faces, watermark"'),
    cfg_scale: z.number().min(0).max(1).optional().describe('Creativity scale from 0.0 (more creative) to 1.0 (more faithful to prompt). Default is 0.5.'),
    camera_control: z.object({
      type: z.enum(['simple', 'down_back', 'forward_up', 'right_turn_forward', 'left_turn_forward']).optional(),
    }).optional().describe('Camera movement control for the generated video.'),
  },
  async ({ prompt, model, duration, aspect_ratio, negative_prompt, cfg_scale, camera_control }) => {
    const body = {
      prompt,
      model_name: model || 'kling-v3',
      duration: duration || '5',
      aspect_ratio: aspect_ratio || '16:9',
    };

    if (negative_prompt) body.negative_prompt = negative_prompt;
    if (cfg_scale !== undefined) body.cfg_scale = cfg_scale;
    if (camera_control) body.camera_control = camera_control;

    const result = await apiRequest('/videos/text2video', 'POST', body);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          task_id: result.data?.task_id,
          status: result.data?.task_status,
          model: body.model_name,
          prompt,
          duration: body.duration,
          aspect_ratio: body.aspect_ratio,
          message: `Video generation started. Use get_task_status with task_id "${result.data?.task_id}" and task_type "text2video" to check progress.`,
          raw: result,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'list_text_to_video_tasks',
  'List all text-to-video generation tasks for your Kling account, with their current status and video URLs when completed.',
  {
    page_num: z.number().int().min(1).optional().default(1).describe('Page number for pagination (starts at 1).'),
    page_size: z.number().int().min(1).max(500).optional().default(30).describe('Number of tasks per page (max 500).'),
  },
  async ({ page_num, page_size }) => {
    const params = new URLSearchParams({
      pageNum: String(page_num || 1),
      pageSize: String(page_size || 30),
    });

    const result = await apiRequest(`/videos/text2video?${params}`, 'GET');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

// -- Tools: Image-to-Video --------------------------------------------------------

server.tool(
  'create_image_to_video',
  'Animate a still image into a video using Kling AI. Provide an image URL and optional motion prompt to control how the image animates. Example: provide a photo of a waterfall and prompt "water flowing gently" to create a cinematic video.',
  {
    image_url: z.string().url().describe('Public URL of the source image to animate. Must be HTTPS. Supported formats: JPG, PNG, WebP.'),
    prompt: z.string().optional().describe('Motion/animation prompt describing how the image should move. Example: "gentle breeze moving through the trees, camera slowly panning right"'),
    model: z.enum(['kling-v1', 'kling-v1-6', 'kling-v2-master', 'kling-v3']).optional().default('kling-v3').describe('Model to use. kling-v3 recommended.'),
    duration: z.enum(['5', '10']).optional().default('5').describe('Video duration in seconds.'),
    negative_prompt: z.string().optional().describe('Elements to avoid. Example: "shaky camera, distortion, blur"'),
    cfg_scale: z.number().min(0).max(1).optional().describe('How closely to follow the prompt (0-1).'),
    tail_image_url: z.string().url().optional().describe('Optional end frame image URL. Kling will interpolate between the start and end images.'),
  },
  async ({ image_url, prompt, model, duration, negative_prompt, cfg_scale, tail_image_url }) => {
    const body = {
      image: image_url,
      model_name: model || 'kling-v3',
      duration: duration || '5',
    };

    if (prompt) body.prompt = prompt;
    if (negative_prompt) body.negative_prompt = negative_prompt;
    if (cfg_scale !== undefined) body.cfg_scale = cfg_scale;
    if (tail_image_url) body.image_tail = tail_image_url;

    const result = await apiRequest('/videos/image2video', 'POST', body);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          task_id: result.data?.task_id,
          status: result.data?.task_status,
          model: body.model_name,
          image_url,
          duration: body.duration,
          message: `Image-to-video started. Use get_task_status with task_id "${result.data?.task_id}" and task_type "image2video" to check progress.`,
          raw: result,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'list_image_to_video_tasks',
  'List all image-to-video generation tasks for your Kling account.',
  {
    page_num: z.number().int().min(1).optional().default(1).describe('Page number (starts at 1).'),
    page_size: z.number().int().min(1).max(500).optional().default(30).describe('Tasks per page (max 500).'),
  },
  async ({ page_num, page_size }) => {
    const params = new URLSearchParams({
      pageNum: String(page_num || 1),
      pageSize: String(page_size || 30),
    });

    const result = await apiRequest(`/videos/image2video?${params}`, 'GET');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

// -- Tools: Video Extensions ------------------------------------------------------

server.tool(
  'extend_video',
  'Extend an existing Kling-generated video to make it longer. Provide the task ID of a completed video to extend it by 4-5 more seconds. Useful for creating longer content from shorter clips.',
  {
    video_id: z.string().describe('Task ID of the completed video to extend. Get this from create_text_to_video or create_image_to_video responses.'),
    prompt: z.string().optional().describe('Optional prompt describing how the video should continue. If omitted, Kling will extrapolate from the existing content.'),
  },
  async ({ video_id, prompt }) => {
    const body = { video_id };
    if (prompt) body.prompt = prompt;

    const result = await apiRequest('/videos/video-extensions', 'POST', body);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          task_id: result.data?.task_id,
          status: result.data?.task_status,
          original_video_id: video_id,
          message: `Video extension started. Use get_task_status with task_id "${result.data?.task_id}" and task_type "video-extensions" to check progress.`,
          raw: result,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'list_video_extensions',
  'List all video extension tasks for your Kling account.',
  {
    page_num: z.number().int().min(1).optional().default(1).describe('Page number (starts at 1).'),
    page_size: z.number().int().min(1).max(500).optional().default(30).describe('Tasks per page (max 500).'),
  },
  async ({ page_num, page_size }) => {
    const params = new URLSearchParams({
      pageNum: String(page_num || 1),
      pageSize: String(page_size || 30),
    });

    const result = await apiRequest(`/videos/video-extensions?${params}`, 'GET');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

// -- Tools: Task Management -------------------------------------------------------

server.tool(
  'get_task_status',
  'Check the status of any Kling video generation task. Returns current status (submitted, processing, completed, failed) and video URL when complete. Poll every 10-30 seconds until status is "completed".',
  {
    task_id: z.string().describe('The task ID returned when you created the video generation job.'),
    task_type: z.enum(['text2video', 'image2video', 'video-extensions', 'lip-sync', 'virtual-try-on']).describe('Type of task to check. Must match the original task type.'),
  },
  async ({ task_id, task_type }) => {
    const result = await apiRequest(`/videos/${task_type}/${task_id}`, 'GET');
    const taskData = result.data;

    const summary = {
      task_id,
      task_type,
      status: taskData?.task_status,
      status_message: taskData?.task_status_msg,
      created_at: taskData?.created_at,
      updated_at: taskData?.updated_at,
    };

    if (taskData?.task_result?.videos?.length > 0) {
      summary.videos = taskData.task_result.videos.map(v => ({
        url: v.url,
        duration: v.duration,
        width: v.width,
        height: v.height,
      }));
      summary.ready = true;
    } else {
      summary.ready = false;
      summary.note = 'Video not ready yet. Poll again in 15-30 seconds.';
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(summary, null, 2),
      }],
    };
  }
);

server.tool(
  'list_all_tasks',
  'List all video generation tasks across all task types for your Kling account. Useful for getting an overview of all past and current generation jobs.',
  {
    task_type: z.enum(['text2video', 'image2video', 'video-extensions', 'lip-sync']).describe('Task type to list.'),
    page_num: z.number().int().min(1).optional().default(1).describe('Page number (starts at 1).'),
    page_size: z.number().int().min(1).max(500).optional().default(30).describe('Tasks per page (max 500).'),
  },
  async ({ task_type, page_num, page_size }) => {
    const params = new URLSearchParams({
      pageNum: String(page_num || 1),
      pageSize: String(page_size || 30),
    });

    const result = await apiRequest(`/videos/${task_type}?${params}`, 'GET');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

server.tool(
  'cancel_task',
  'Attempt to cancel a pending or in-progress Kling video generation task. Note: tasks that have already started processing may not be cancellable.',
  {
    task_id: z.string().describe('The task ID to cancel.'),
    task_type: z.enum(['text2video', 'image2video', 'video-extensions', 'lip-sync']).describe('Type of the task to cancel.'),
  },
  async ({ task_id, task_type }) => {
    // Kling does not have a dedicated cancel endpoint; we return the current status
    // and note that cancellation is not supported via API
    const result = await apiRequest(`/videos/${task_type}/${task_id}`, 'GET');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          task_id,
          task_type,
          current_status: result.data?.task_status,
          message: 'Kling API does not currently support task cancellation via API. The task will complete or fail on its own. You can monitor it with get_task_status.',
          raw: result,
        }, null, 2),
      }],
    };
  }
);

// -- Tools: Account ---------------------------------------------------------------

server.tool(
  'get_account_info',
  'Retrieve your Kling AI account information, including account details and current plan status.',
  {},
  async () => {
    const result = await apiRequest('/account/info', 'GET');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

server.tool(
  'get_credits_balance',
  'Check your current Kling AI credits balance. Credits are consumed when generating videos — text-to-video and image-to-video use different amounts based on duration and model.',
  {},
  async () => {
    const result = await apiRequest('/account/credits', 'GET');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          credits: result.data,
          pricing_note: 'kling-v3: ~0.084-0.168 credits/gen, kling-v2-master: ~0.21-1.68 credits/gen, kling-v1-6: ~0.28-1.40 credits/gen, kling-v1: ~0.14-0.98 credits/gen',
          raw: result,
        }, null, 2),
      }],
    };
  }
);

// -- Tools: Video Editing ---------------------------------------------------------

server.tool(
  'lip_sync_video',
  'Synchronize a video\'s lip movements with a provided audio track using Kling AI. Perfect for dubbing, voice-over, or creating talking head videos. The video subject\'s mouth will be animated to match the audio.',
  {
    video_url: z.string().url().describe('Public URL of the video to lip-sync. Must show a face/person clearly. HTTPS required.'),
    audio_url: z.string().url().optional().describe('Public URL of the audio track to sync to. If omitted with text, Kling will use TTS.'),
    audio_type: z.enum(['audio', 'text']).optional().default('audio').describe('Source type: "audio" for an audio file URL, "text" for text-to-speech.'),
    text: z.string().optional().describe('Text to convert to speech for lip-sync (used when audio_type is "text").'),
    voice_id: z.string().optional().describe('Voice ID for TTS when using text mode. Check Kling documentation for available voices.'),
    voice_language: z.enum(['zh', 'en']).optional().describe('Language for TTS: "zh" for Chinese, "en" for English.'),
  },
  async ({ video_url, audio_url, audio_type, text, voice_id, voice_language }) => {
    const body = {
      video_url,
      audio_type: audio_type || 'audio',
    };

    if (audio_type === 'text' || !audio_url) {
      if (!text) throw new Error('text is required when audio_type is "text"');
      body.text = text;
      if (voice_id) body.voice_id = voice_id;
      if (voice_language) body.voice_language = voice_language;
    } else {
      if (!audio_url) throw new Error('audio_url is required when audio_type is "audio"');
      body.audio_url = audio_url;
    }

    const result = await apiRequest('/videos/lip-sync', 'POST', body);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          task_id: result.data?.task_id,
          status: result.data?.task_status,
          message: `Lip-sync task started. Use get_task_status with task_id "${result.data?.task_id}" and task_type "lip-sync" to check progress.`,
          raw: result,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'virtual_try_on',
  'Apply clothing or accessories to a person in an image using Kling AI virtual try-on. Provide a model image (person) and a garment image to see how the outfit looks on the model.',
  {
    model_image_url: z.string().url().describe('Public URL of the image showing the person/model to dress. Full body or upper body shots work best. HTTPS required.'),
    garment_image_url: z.string().url().describe('Public URL of the clothing/garment image to try on. Should be a clean product photo. HTTPS required.'),
    garment_type: z.enum(['top', 'bottom', 'full_body']).optional().default('top').describe('Type of garment: "top" for shirts/jackets, "bottom" for pants/skirts, "full_body" for dresses/suits.'),
  },
  async ({ model_image_url, garment_image_url, garment_type }) => {
    const body = {
      model_image: model_image_url,
      garment_image: garment_image_url,
      garment_type: garment_type || 'top',
    };

    const result = await apiRequest('/images/virtual-try-on', 'POST', body);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          task_id: result.data?.task_id,
          status: result.data?.task_status,
          message: `Virtual try-on task started. Use get_task_status with task_id "${result.data?.task_id}" and task_type "virtual-try-on" to check progress.`,
          raw: result,
        }, null, 2),
      }],
    };
  }
);

// -- Express + Transport ----------------------------------------------------------

const app = express();
app.use(express.json());

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'kling-complete', version: '1.0.0' });
});

// MCP endpoint
app.all('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on('close', () => transport.close());

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Start server
app.listen(PORT, () => {
  console.log(`Kling Complete MCP server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`MCP:    http://localhost:${PORT}/mcp`);

  if (!KLING_API_KEY) {
    console.warn('WARNING: KLING_API_KEY is not set. All API calls will fail until it is configured.');
  }
});
