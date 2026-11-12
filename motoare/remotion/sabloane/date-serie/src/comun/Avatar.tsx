// Avatarul unui testimonial: poza în cerc (decupată pe centru) sau, fără poză, inițialele pe un cerc în culoarea
// de accent. Diametrul și poziția vin din props (serie/card.mjs); intrarea e o scalare ușoară cu fade.
import React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { progres } from './miscare.mjs';
import type { Card, Stil } from '../tipuri';

export const Avatar: React.FC<{ avatar: Card['avatar']; stil: Stil }> = ({ avatar, stil }) => {
  const cadru = useCurrentFrame();
  const p = progres(cadru, avatar.de, avatar.pana);
  const { x, y, diametru } = avatar;
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: diametru, height: diametru, borderRadius: '50%', overflow: 'hidden',
        opacity: p, transform: p === 1 ? undefined : `scale(${0.9 + 0.1 * p})`,
        backgroundColor: avatar.poza ? stil.culori.fundal : stil.culori.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {avatar.poza ? (
        <Img src={staticFile(avatar.poza)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontFamily: `"${stil.familii.titlu}"`, fontWeight: 700, fontSize: Math.round(diametru * 0.4), color: stil.culori.fundal, lineHeight: 1 }}>
          {avatar.initiale}
        </span>
      )}
    </div>
  );
};
