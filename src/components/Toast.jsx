import { useEffect, useState } from 'react';

export default function Toast() {
  const [text, setText] = useState('');
  useEffect(() => {
    let id;
    const onToast = (e) => {
      setText(e.detail);
      clearTimeout(id);
      id = setTimeout(() => setText(''), 3200);
    };
    window.addEventListener('toast', onToast);
    return () => {
      window.removeEventListener('toast', onToast);
      clearTimeout(id);
    };
  }, []);
  return text ? <div className="toast" role="status">{text}</div> : null;
}
