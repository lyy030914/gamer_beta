<template>
  <div class="play-page">
    <div v-if="loading || fetchingGame" class="loading">
      <div class="spinner"></div>
      <p>Loading game...</p>
    </div>

    <div v-else-if="gameHtml" class="play-container">
      <div class="play-header">
        <button @click="$router.back()" class="back-btn">&larr; Back</button>
        <div class="play-game-info">
          <h2>{{ game?.title || 'Game' }}</h2>
          <span class="play-author">by {{ game?.author?.nickname || 'Unknown' }}</span>
        </div>
      </div>

      <div class="game-frame-wrapper">
        <iframe
          :srcdoc="gameHtml"
          class="game-frame"
          allow="autoplay; fullscreen; camera; microphone"
          sandbox="allow-scripts allow-same-origin allow-popups allow-modals allow-forms allow-pointer-lock"
          @load="onGameLoaded"
        ></iframe>
      </div>
    </div>

    <div v-else class="empty-state">
      <h3>Game not found or failed to load</h3>
      <router-link to="/" class="btn btn-primary">Back to Home</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useGamesStore } from '../stores/games'
import axios from 'axios'

const route = useRoute()
const gamesStore = useGamesStore()
const game = ref(null)
const gameHtml = ref('')
const loading = ref(true)
const fetchingGame = ref(false)

onMounted(async () => {
  try {
    game.value = await gamesStore.fetchGame(route.params.id)
    if (game.value?.gameUrl) {
      fetchingGame.value = true
      const res = await axios.get(game.value.gameUrl)
      gameHtml.value = res.data
      fetchingGame.value = false
    }
  } catch (e) {
    game.value = null
    gameHtml.value = ''
  } finally {
    loading.value = false
  }
})

function onGameLoaded() {
  console.log('Game loaded:', game.value?.title)
}
</script>

<style scoped>
.play-page { margin: -32px -24px; }
.play-container { display: flex; flex-direction: column; height: calc(100vh - 64px); }
.play-header { display: flex; align-items: center; gap: 16px; padding: 16px 24px; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.back-btn { background: none; border: 1px solid var(--border); color: var(--text-muted); cursor: pointer; font-size: 14px; padding: 6px 14px; border-radius: var(--radius-sm); }
.back-btn:hover { color: var(--primary); border-color: var(--primary); }
.play-game-info h2 { font-size: 18px; font-weight: 600; }
.play-author { font-size: 13px; color: var(--text-muted); }
.game-frame-wrapper { flex: 1; background: #000; }
.game-frame { width: 100%; height: 100%; border: none; }
.no-game-file { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 18px; }
</style>
