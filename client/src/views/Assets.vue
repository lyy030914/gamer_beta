<template>
  <div class="assets-page">
    <div class="page-header">
      <h1 class="page-title">Material Library</h1>
      <p class="page-subtitle">Upload reference images to inspire your game creations</p>
    </div>

    <div class="upload-section">
      <label class="upload-zone" :class="{ dragging }"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="handleDrop"
      >
        <input type="file" accept="image/*" multiple @change="handleFiles" hidden ref="fileInput" />
        <div class="upload-zone-content">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
          </svg>
          <h3>Click or drag images here</h3>
          <p>JPG, PNG, WebP, GIF, SVG (max 10MB each)</p>
        </div>
      </label>
    </div>

    <div v-if="uploading.length" class="uploading-bar">
      <div v-for="item in uploading" :key="item.name" class="uploading-item">
        <div class="mini-spinner"></div><span>{{ item.name }}</span>
      </div>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div><p>Loading...</p></div>

    <div v-else-if="assets.length === 0" class="empty-state">
      <h3>No materials yet</h3>
      <p>Upload reference images to build your library</p>
    </div>

    <div v-else class="assets-grid">
      <div v-for="asset in assets" :key="asset.id" class="asset-card" @click="previewUrl = asset.url">
        <div class="asset-image"><img :src="asset.url" :alt="asset.filename" loading="lazy" /></div>
        <div class="asset-info">
          <span class="asset-name" :title="asset.filename">{{ asset.filename }}</span>
          <div class="asset-meta">
            <span>{{ formatSize(asset.size) }}</span>
            <span>{{ formatDate(asset.created_at) }}</span>
          </div>
        </div>
        <div class="asset-actions">
          <button class="action-btn" @click.stop="copyUrl(asset.url)" title="Copy URL">&#x1F4CB;</button>
          <button class="action-btn del-btn" @click.stop="handleDelete(asset)" title="Delete">&#x1F5D1;</button>
        </div>
      </div>
    </div>

    <div v-if="total > pageSize" class="pagination">
      <button :disabled="page <= 1" @click="changePage(page - 1)" class="btn">Prev</button>
      <span class="page-info">Page {{ page }}</span>
      <button :disabled="page * pageSize >= total" @click="changePage(page + 1)" class="btn">Next</button>
    </div>

    <div v-if="previewUrl" class="modal-overlay" @click.self="previewUrl = null">
      <div class="preview-modal">
        <img :src="previewUrl" alt="Preview" />
        <button class="close-btn" @click="previewUrl = null">&times;</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const auth = useAuthStore()
const assets = ref([])
const total = ref(0)
const loading = ref(true)
const page = ref(1)
const pageSize = 50
const uploading = ref([])
const dragging = ref(false)
const previewUrl = ref(null)
const fileInput = ref(null)

onMounted(() => { if (auth.isLoggedIn) fetchAssets() })

async function fetchAssets() {
  loading.value = true
  try {
    const res = await api.get('/assets', { params: { page: page.value, pageSize } })
    assets.value = res.data.assets
    total.value = res.data.total
  } finally { loading.value = false }
}

function changePage(p) { page.value = p; fetchAssets() }

async function uploadFile(file) {
  uploading.value.push({ name: file.name })
  try {
    const fd = new FormData(); fd.append('file', file)
    await api.post('/assets/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    await fetchAssets()
  } catch (e) { alert('Upload failed: ' + (e.response?.data?.error || e.message)) }
  finally { uploading.value = uploading.value.filter(u => u.name !== file.name) }
}

function handleFiles(e) { Array.from(e.target.files).forEach(uploadFile); e.target.value = '' }
function handleDrop(e) { dragging.value = false; Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(uploadFile) }

async function handleDelete(asset) {
  if (!confirm(`Delete "${asset.filename}"?`)) return
  try {
    await api.delete(`/assets/${asset.id}`)
    assets.value = assets.value.filter(a => a.id !== asset.id)
    total.value = Math.max(0, total.value - 1)
  } catch (e) { alert('Delete failed') }
}

function copyUrl(url) {
  const full = window.location.origin + url
  navigator.clipboard.writeText(full).then(() => alert('URL copied!')).catch(() => prompt('Copy:', full))
}

function formatSize(b) {
  if (!b) return '0 B'; if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}
function formatDate(d) { return d ? new Date(d).toLocaleDateString() : '' }
</script>

<style scoped>
.assets-page { max-width: 1200px; }
.upload-section { margin-bottom: 24px; }
.upload-zone { display: block; border: 2px dashed var(--border); border-radius: var(--radius); padding: 36px; text-align: center; cursor: pointer; transition: all .2s; background: var(--bg-card); }
.upload-zone:hover,.upload-zone.dragging { border-color: var(--primary); background: rgba(99,102,241,0.05); }
.upload-zone-content { color: var(--text-muted); }
.upload-zone-content svg { margin-bottom: 10px; }
.upload-zone-content h3 { font-size: 16px; margin-bottom: 4px; color: var(--text); }
.upload-zone-content p { font-size: 13px; }
.uploading-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.uploading-item { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: var(--radius-sm); background: var(--bg-card); border: 1px solid var(--border); font-size: 13px; color: var(--text-muted); }
.mini-spinner { width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin .6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.assets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.asset-card { background: var(--bg-card); border-radius: var(--radius); border: 1px solid var(--border); overflow: hidden; cursor: pointer; transition: all .2s; position: relative; }
.asset-card:hover { border-color: var(--primary); transform: translateY(-2px); }
.asset-image { aspect-ratio: 4/3; overflow: hidden; background: var(--bg); }
.asset-image img { width: 100%; height: 100%; object-fit: cover; transition: transform .3s; }
.asset-card:hover .asset-image img { transform: scale(1.05); }
.asset-info { padding: 8px 10px; }
.asset-name { font-size: 13px; font-weight: 500; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.asset-meta { display: flex; justify-content: space-between; margin-top: 3px; font-size: 11px; color: var(--text-muted); }
.asset-actions { position: absolute; top: 6px; right: 6px; display: flex; gap: 4px; opacity: 0; transition: opacity .2s; }
.asset-card:hover .asset-actions { opacity: 1; }
.action-btn { width: 26px; height: 26px; border-radius: 5px; border: none; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); color: #fff; }
.action-btn:hover { background: var(--primary); }
.del-btn:hover { background: #ef4444; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 200; backdrop-filter: blur(4px); }
.preview-modal { max-width: 90vw; max-height: 90vh; position: relative; }
.preview-modal img { max-width: 90vw; max-height: 85vh; border-radius: var(--radius); }
.close-btn { position: absolute; top: -14px; right: -14px; width: 30px; height: 30px; border-radius: 50%; border: none; background: var(--bg-card); color: var(--text); font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 28px; }
.page-info { font-size: 14px; color: var(--text-muted); }
</style>
