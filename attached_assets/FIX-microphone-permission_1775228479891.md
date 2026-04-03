# FIX — Accès micro refusé dans SampleLoaderModal

## Problème
Quand on appuie sur REC dans la modale d'enregistrement, le message "accès au micro non autorisé" apparaît.

## Diagnostic
Le `getUserMedia` peut échouer pour 3 raisons :
1. Le site n'est pas en HTTPS (ni localhost) — le navigateur bloque silencieusement
2. L'utilisateur a refusé la permission dans le navigateur
3. L'OS (macOS/iOS) bloque l'accès micro pour le navigateur

## Actions correctives à appliquer dans `SampleLoaderModal.tsx`

### 1. Améliorer la gestion d'erreur de getUserMedia

Remplacer le bloc `getUserMedia` dans le handler du bouton REC par ce code robuste :

```typescript
const startRecording = async () => {
  // 1. Check if getUserMedia is available at all
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setError("Votre navigateur ne supporte pas l'enregistrement audio. Utilisez Chrome, Firefox ou Safari récent.");
    return;
  }

  try {
    // 2. Request microphone permission with proper constraints
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,    // CRUCIAL pour samples musicaux
        noiseSuppression: false,    // Pas de réduction de bruit
        autoGainControl: false,     // Pas de normalisation auto
        sampleRate: { ideal: 44100 },
        channelCount: { ideal: 1 },
      }
    });
    
    // 3. Determine best MIME type for this browser
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''; // Let browser pick default
    
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    
    recorder.onstop = async () => {
      // CRUCIAL: release microphone immediately
      stream.getTracks().forEach(t => t.stop());
      
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        // Clone the buffer because decodeAudioData consumes it
        const bufferCopy = arrayBuffer.slice(0);
        const audioBuffer = await audioCtx!.decodeAudioData(bufferCopy);
        // → transition to TRIM state with audioBuffer
        setRecordedBuffer(audioBuffer);
        setPhase('trim');
      } catch (decodeErr) {
        console.error('Failed to decode recording:', decodeErr);
        setError("Erreur de décodage audio. Essayez d'enregistrer à nouveau.");
      }
    };
    
    recorder.onerror = (e) => {
      console.error('MediaRecorder error:', e);
      stream.getTracks().forEach(t => t.stop());
      setError("Erreur pendant l'enregistrement.");
    };
    
    // Store recorder ref and start
    recorderRef.current = recorder;
    streamRef.current = stream;
    recorder.start(100); // collect data every 100ms for responsive stop
    setPhase('recording');
    setError(null);
    
  } catch (err: any) {
    console.error('getUserMedia error:', err.name, err.message);
    
    // 4. Provide specific user-friendly error messages
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      setError(
        "🎤 Accès micro refusé.\n\n" +
        "Pour autoriser :\n" +
        "• Chrome : cliquez sur l'icône 🔒 dans la barre d'adresse → Autorisations → Micro → Autoriser\n" +
        "• Safari : Réglages → Safari → Microphone → Autoriser\n" +
        "• Firefox : cliquez sur l'icône 🔒 → Permissions → Micro\n\n" +
        "Sur macOS : Préférences Système → Confidentialité → Microphone → cochez votre navigateur\n" +
        "Sur iOS : Réglages → Safari → Micro → Autoriser"
      );
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      setError("🎤 Aucun microphone détecté. Branchez un micro ou vérifiez vos réglages audio.");
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      setError("🎤 Le microphone est déjà utilisé par une autre application. Fermez-la et réessayez.");
    } else if (err.name === 'OverconstrainedError') {
      // Retry without strict constraints
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // ... same MediaRecorder setup with fallbackStream
        // (extract into a shared function to avoid duplication)
        streamRef.current = fallbackStream;
        // Retry recording with basic constraints
        startRecordingWithStream(fallbackStream);
        return;
      } catch {
        setError("🎤 Impossible d'accéder au micro avec les paramètres demandés.");
      }
    } else {
      setError(`🎤 Erreur micro : ${err.message || err.name}`);
    }
  }
};
```

### 2. Ajouter un état `error` dans le composant

```typescript
const [error, setError] = useState<string | null>(null);
```

Et dans le JSX, afficher l'erreur de manière visible :

```tsx
{error && (
  <div style={{
    padding: '12px 16px',
    borderRadius: 10,
    background: 'rgba(255,45,85,0.08)',
    border: '1px solid rgba(255,45,85,0.3)',
    color: '#FF2D55',
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'pre-line',  // pour respecter les \n dans le message
    marginBottom: 12,
    lineHeight: 1.5,
  }}>
    {error}
  </div>
)}
```

### 3. Ajouter un check HTTPS au montage du composant

```typescript
useEffect(() => {
  if (open) {
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) {
      setError(
        "⚠️ L'enregistrement nécessite HTTPS.\n\n" +
        "L'app tourne en HTTP non-sécurisé — le navigateur bloque l'accès au micro.\n" +
        "Solutions :\n" +
        "• Accédez via localhost au lieu de l'IP réseau\n" +
        "• Activez HTTPS dans votre serveur de développement\n" +
        "• Déployez sur un domaine avec certificat SSL"
      );
    }
  }
}, [open]);
```

### 4. Vérifier que le serveur dev Vite écoute sur localhost

Dans `vite.config.ts`, vérifier que le serveur est accessible via localhost :
```typescript
server: {
  host: 'localhost',  // ou '0.0.0.0' si besoin d'accès réseau
  port: 3000,
  // Pour HTTPS en dev (optionnel mais résout tout) :
  // https: true,  // Vite génère un certificat auto-signé
}
```

### 5. Sur Replit spécifiquement

Replit expose les apps via HTTPS automatiquement (ex: `https://xxx.replit.dev`). Le micro devrait fonctionner si tu accèdes via l'URL `.replit.dev` et non via l'iframe de preview. **Ouvre l'app dans un nouvel onglet** (bouton "Open in new tab" en haut à droite de la preview Replit).

## Résumé
- Le code doit gérer gracieusement TOUS les cas d'erreur de `getUserMedia`
- Les messages d'erreur doivent guider l'utilisateur vers la solution
- Fallback vers des contraintes basiques si les contraintes avancées échouent
- Toujours libérer le stream micro dans le `onstop` ET dans le `catch`
- Sur Replit : ouvrir dans un nouvel onglet pour avoir le vrai contexte HTTPS
