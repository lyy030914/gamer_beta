import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useGamesStore = defineStore('games', () => {
  const games = ref([])
  const total = ref(0)
  const loading = ref(false)

  async function fetchGames(params = {}) {
    loading.value = true
    try {
      const res = await api.get('/games', { params })
      games.value = res.data.games
      total.value = res.data.total
    } finally {
      loading.value = false
    }
  }

  async function fetchGame(id) {
    const res = await api.get(`/games/${id}`)
    return res.data.game
  }

  async function createGame(data) {
    const res = await api.post('/games', data)
    return res.data.game
  }

  async function deleteGame(id) {
    await api.delete(`/games/${id}`)
    games.value = games.value.filter(g => g.id !== id)
    total.value = Math.max(0, total.value - 1)
  }

  return { games, total, loading, fetchGames, fetchGame, createGame, deleteGame }
})
