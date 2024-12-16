// src/components/fetchWithTimeout.js

// ヘルパー関数: fetch with timeout
export const fetchWithTimeout = (url, options, timeout = 60000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error('リクエストがタイムアウトしました。後でもう一度お試しください。')
        );
      }, timeout);
  
      fetch(url, options)
        .then((response) => {
          clearTimeout(timer);
          resolve(response);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };
  