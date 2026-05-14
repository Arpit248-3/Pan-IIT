import api from './api'

export const notificationService = {
  getAll:     (userId)  => api.get(`/api/notifications${userId ? `?user_id=${userId}` : ''}`),
  getCount:   (userId)  => api.get(`/api/notifications/count${userId ? `?user_id=${userId}` : ''}`, true), // silent
  markRead:   (id)      => api.put(`/api/notifications/${id}/read`, {}),
  markAllRead:(userId)  => api.put(`/api/notifications/read-all${userId ? `?user_id=${userId}` : ''}`, {}),
  remove:     (id)      => api.delete(`/api/notifications/${id}`),
}
export default notificationService
