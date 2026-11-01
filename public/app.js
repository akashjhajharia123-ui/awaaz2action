const form = document.querySelector('#complaint-form');
const issue = document.querySelector('#issue');
const count = document.querySelector('#char-count');
const generateButton = document.querySelector('#generate');
const draft = document.querySelector('#draft');
const states = ['empty-state', 'loading-state', 'error-state', 'draft-state'];
let lastPayload = null;
let mediaRecorder = null;
let mediaStream = null;
let recordingStartedAt = 0;
let recordingTimer = null;
let recordedChunks = [];
const maxRecordingMs = 30000;

issue.addEventListener('input', () => { count.textContent = `${issue.value.length.toLocaleString()} / 6,000`; });
document.querySelectorAll('.tone input').forEach(input => input.addEventListener('change', () => {
  document.querySelectorAll('.tone').forEach(label => label.classList.toggle('active', label.contains(document.querySelector('.tone input:checked'))));
}));

function showState(id) {
  states.forEach(state => { document.getElementById(state).hidden = state !== id; });
}

function getLanguageLabel() {
  const select = document.querySelector('#language');
  return select.options[select.selectedIndex].text;
}

async function generate(payload) {
  lastPayload = payload;
  showState('loading-state');
  generateButton.disabled = true;
  generateButton.querySelector('.button-label').textContent = 'Putting it together…';
  try {
    const response = await fetch('/api/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(65000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not generate your complaint. Please try again.');
    draft.value = result.complaint;
    document.querySelector('#draft-language').textContent = `${getLanguageLabel().split(' ')[0].toLocaleUpperCase()} DRAFT`;
    document.querySelector('#draft-category').textContent = (result.category || 'Civic issue').toLocaleUpperCase();
    document.querySelector('#copy-status').textContent = '';
    showState('draft-state');
    document.querySelector('#result-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'This is taking longer than expected. Please try again.' : error.message;
    document.querySelector('#error-message').textContent = message;
    showState('error-state');
  } finally {
    generateButton.disabled = false;
    generateButton.querySelector('.button-label').textContent = 'Draft my complaint';
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  generate({
    issue: issue.value,
    department: document.querySelector('#department').value,
    category: document.querySelector('#category').value,
    locality: document.querySelector('#locality').value,
    street: document.querySelector('#street').value,
    landmark: document.querySelector('#landmark').value,
    duration: document.querySelector('#duration').value,
    language: document.querySelector('#language').value,
    name: document.querySelector('#name').value,
    tone: document.querySelector('input[name="tone"]:checked').value
  });
});

document.querySelector('#retry-button').addEventListener('click', () => { if (lastPayload) generate(lastPayload); });

const voiceButton = document.querySelector('#voice-button');
const voiceLabel = document.querySelector('#voice-button-label');
const voiceFeedback = document.querySelector('#voice-feedback');
const voiceMessage = document.querySelector('#voice-message');
const voiceIndicator = document.querySelector('#voice-indicator');

function showVoiceMessage(message, state = '') {
  voiceFeedback.hidden = !message;
  voiceMessage.textContent = message;
  voiceFeedback.dataset.state = state;
  voiceIndicator.hidden = state !== 'recording' && state !== 'loading';
}

function stopMediaTracks() {
  if (recordingTimer) clearInterval(recordingTimer);
  recordingTimer = null;
  if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
  mediaStream = null;
}

async function transcribeRecording(blob) {
  if (!blob.size) {
    showVoiceMessage('No audio was captured. Please try again.', 'error');
    return;
  }
  voiceButton.disabled = true;
  voiceButton.classList.remove('recording');
  voiceLabel.textContent = 'Transcribing…';
  showVoiceMessage('Sending your recording securely to Sarvam for transcription…', 'loading');
  try {
    const formData = new FormData();
    const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    formData.append('file', blob, `complaint.${extension}`);
    const response = await fetch('/api/transcribe', { method: 'POST', body: formData, signal: AbortSignal.timeout(65000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Speech recognition failed. Please try again.');
    const transcript = result.transcript.trim();
    issue.value = issue.value.trim() ? `${issue.value.trim()}\n${transcript}` : transcript;
    issue.dispatchEvent(new Event('input', { bubbles: true }));
    issue.focus();
    showVoiceMessage(`Transcript added${result.language ? ` (${result.language})` : ''}. Review and edit it before generating your grievance.`, 'success');
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'Transcription took too long. Please try again.' : error.message;
    showVoiceMessage(message, 'error');
  } finally {
    voiceButton.disabled = false;
    voiceLabel.textContent = 'Speak';
    voiceButton.setAttribute('aria-label', 'Start voice input');
  }
}

voiceButton.addEventListener('click', async () => {
  if (mediaRecorder?.state === 'recording') {
    if (recordingTimer) clearInterval(recordingTimer);
    recordingTimer = null;
    mediaRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    showVoiceMessage('Voice recording is not supported in this browser. Please type your complaint instead.', 'error');
    return;
  }
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) {
    showVoiceMessage('This browser cannot record an audio format supported by Saaras. Please type your complaint instead.', 'error');
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
    mediaRecorder.addEventListener('dataavailable', event => { if (event.data?.size) recordedChunks.push(event.data); });
    mediaRecorder.addEventListener('error', () => {
      stopMediaTracks();
      voiceButton.classList.remove('recording');
      voiceLabel.textContent = 'Speak';
      voiceButton.disabled = false;
      showVoiceMessage('Recording failed. Please try again or type your complaint.', 'error');
    }, { once: true });
    mediaRecorder.addEventListener('stop', () => {
      const audio = new Blob(recordedChunks, { type: mimeType.split(';')[0] });
      stopMediaTracks();
      transcribeRecording(audio);
    }, { once: true });
    recordingStartedAt = Date.now();
    mediaRecorder.start(250);
    voiceButton.classList.add('recording');
    voiceLabel.textContent = 'Stop · 00:00';
    voiceButton.setAttribute('aria-label', 'Stop recording');
    showVoiceMessage('Recording… Speak clearly. Recording stops automatically at 30 seconds.', 'recording');
    recordingTimer = setInterval(() => {
      const elapsed = Date.now() - recordingStartedAt;
      const seconds = Math.min(30, Math.floor(elapsed / 1000));
      voiceLabel.textContent = `Stop · 00:${String(seconds).padStart(2, '0')}`;
      if (elapsed >= maxRecordingMs && mediaRecorder?.state === 'recording') {
        mediaRecorder.stop();
        clearInterval(recordingTimer);
        recordingTimer = null;
      }
    }, 200);
  } catch (error) {
    stopMediaTracks();
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') showVoiceMessage('Microphone access was denied. Allow microphone access in your browser settings or type your complaint.', 'error');
    else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') showVoiceMessage('No microphone was found. Connect a microphone or type your complaint.', 'error');
    else showVoiceMessage('Could not start the microphone. Please try again or type your complaint.', 'error');
  }
});

document.querySelector('#copy-button').addEventListener('click', async event => {
  const button = event.currentTarget;
  const status = document.querySelector('#copy-status');
  if (!draft.value.trim()) { status.textContent = 'There is no draft to copy yet.'; return; }
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(draft.value);
    } else {
      draft.focus();
      draft.select();
      const copied = document.execCommand('copy');
      draft.setSelectionRange(draft.value.length, draft.value.length);
      if (!copied) throw new Error('Clipboard access is unavailable. Select and copy the draft manually.');
    }
    status.textContent = 'Draft copied to clipboard.';
    const original = button.innerHTML;
    button.innerHTML = '<span>✓</span> Copied!';
    setTimeout(() => { button.innerHTML = original; }, 1600);
  } catch (error) {
    status.textContent = error.message || 'Could not copy the draft. Select the text and copy it manually.';
  }
});

document.querySelector('#download-button').addEventListener('click', () => {
  const status = document.querySelector('#copy-status');
  if (!draft.value.trim()) { status.textContent = 'There is no draft to download yet.'; return; }
  const language = getLanguageLabel();
  const category = document.querySelector('#draft-category').textContent;
  const body = draft.value.replace(/\r\n?/g, '\n').trim();
  const contents = [
    'AWAAZ2ACTION',
    'CIVIC GRIEVANCE DRAFT',
    'STATUS: NOT SUBMITTED — REVIEW AND EDIT BEFORE SENDING',
    `CATEGORY: ${category}`,
    `LANGUAGE: ${language}`,
    '─'.repeat(58),
    '',
    body,
    '',
    '─'.repeat(58),
    'Prepared with Awaaz2Action. This document is a draft and has not been submitted.'
  ].join('\n');
  const blob = new Blob(['\uFEFF', contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Awaaz2Action-Grievance-Draft.txt';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = 'Draft download started.';
});
