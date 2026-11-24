/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyArB-5ImsCi6J1r0jszaP-enmIOAvHnxXQ',
  authDomain: 'gen-lang-client-0157510995.firebaseapp.com',
  projectId: 'gen-lang-client-0157510995',
  storageBucket: 'gen-lang-client-0157510995.firebasestorage.app',
  messagingSenderId: '288268841305',
  appId: '1:288268841305:web:8badaab9ffe259d4ef5c48',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'AINEMAX';
  const options = {
    body: payload?.notification?.body || 'You have a new update on AINEMAX.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: {
      linkPath: payload?.data?.linkPath || '/notifications',
    },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification?.data?.linkPath || '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetPath);
          }
          return client;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetPath);
      }
      return undefined;
    })
  );
});
