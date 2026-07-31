'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library';

// Vehicle compliance-label / window-sticker VIN barcodes are Code 39 per the
// AAMVA/NHTSA standard; Code 128 is included as a fallback since a handful
// of aftermarket labels use it instead.
const HINTS = new Map();
HINTS.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_39, BarcodeFormat.CODE_128]);

// ISO 3779: 17 chars, excludes I/O/Q to avoid confusion with 1/0.
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

interface VinScannerProps {
  onScan: (vin: string) => void;
  onClose: () => void;
}

export function VinScanner({ onScan, onClose }: VinScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserMultiFormatReader(HINTS);

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current!,
        (result, err) => {
          if (cancelled || detected) return;
          if (result) {
            const text = result.getText().trim().toUpperCase();
            if (VIN_PATTERN.test(text)) {
              setDetected(text);
              controlsRef.current?.stop();
              onScan(text);
            }
            // Barcode found but doesn't look like a VIN — keep scanning
            // rather than accepting garbage.
          } else if (err && !(err instanceof NotFoundException)) {
            setError('Scanning error — try again or enter the VIN manually.');
          }
        }
      )
      .then((controls) => {
        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        if (err?.name === 'NotAllowedError') {
          setError('Camera access was denied. Enter the VIN manually instead.');
        } else if (err?.name === 'NotFoundError') {
          setError('No camera was found on this device. Enter the VIN manually instead.');
        } else {
          setError('Could not start the camera. Enter the VIN manually instead.');
        }
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg overflow-hidden max-w-md w-full">
        <div className="p-4 flex items-center justify-between border-b border-neutral-200">
          <h3 className="font-bold text-neutral-900">Scan VIN Barcode</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 text-xl leading-none"
            aria-label="Close scanner"
          >
            ×
          </button>
        </div>

        <div className="relative bg-black aspect-[4/3]">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {!error && !detected && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-4/5 h-16 border-2 border-accent-400 rounded-md" />
            </div>
          )}
        </div>

        <div className="p-4">
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : detected ? (
            <p className="text-sm text-accent-700 font-medium">Detected: {detected}</p>
          ) : (
            <p className="text-sm text-neutral-500">
              Point the camera at the VIN barcode on the compliance label or window sticker.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
