import React, { useState } from 'react';
import { getAbsolutePhotoUrl } from '../../profile/domain/profileModel.js';

export default function GuardianAvatar({ src, name, className }) {
  const [failedSrc, setFailedSrc] = useState(null);

  if (!src || failedSrc === src) {
    return (
      <div className={`${className} guardian-avatar-placeholder media-icon-placeholder`} role="img" aria-label={name || 'Guardião'}>
        <i className="fa-solid fa-user" aria-hidden="true" />
      </div>
    );
  }
  return <img src={getAbsolutePhotoUrl(src)} alt={name} className={className} onError={() => setFailedSrc(src)} />;
}
