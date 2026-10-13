import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  signal
} from '@angular/core';
import { EyeComponent } from './components/eye/eye';

@Component({
  selector: 'app-root',
  imports: [EyeComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Existing template bindings: keep these names unchanged.
  depthDisplay = '000';
  signal = 'STABLE';
  aboutCompromised = false;
  transmissionStage = signal(0);

  // Keyboard/touch visitors can pin recovered records rather than relying on light.
  pinnedFragments: boolean[] = [false, false, false];
  decodedWhispers: boolean[] = [false, false];
  archivePinned = false;

  transmissionAnnouncement = computed(() => {
    const stage = this.transmissionStage();
    if (stage === 1) return 'Connecting to the communication channel. Please wait.';
    if (stage === 4) return 'Connection established. Finalizing transmission.';
    if (stage === 6) return 'Channel open. Contact links are now available.';
    return '';
  });

  toggleFragment(index: number): void {
    if (index < 0 || index >= this.pinnedFragments.length) return;
    this.pinnedFragments = this.pinnedFragments.map((pinned, i) => i === index ? !pinned : pinned);
  }

  toggleWhisper(index: number): void {
    if (index < 0 || index >= this.decodedWhispers.length) return;
    this.decodedWhispers = this.decodedWhispers.map((decoded, i) => i === index ? !decoded : decoded);
  }

  toggleArchive(): void { this.archivePinned = !this.archivePinned; }

  // Cache elements instead of querying the DOM on every pointer movement.
  private hero: HTMLElement | null = null;
  private about: HTMLElement | null = null;
  private lighting: HTMLElement | null = null;
  private beam: HTMLElement | null = null;
  private beamStart: HTMLElement | null = null;
  private beamEnd: HTMLElement | null = null;
  private watcherEye: HTMLElement | null = null;
  private watcherIris: HTMLElement | null = null;
  private illuminatedTargets: HTMLElement[] = [];

  private pointerX = 0;
  private pointerY = 0;
  private pointerFrame: number | null = null;
  private scrollFrame: number | null = null;
  private hoverFrame: number | null = null;
  private lastHoverCheck = 0;
  private bootTimers: number[] = [];

  ngAfterViewInit(): void {
    // Avoid touching document/window while Angular renders on the server.
    if (!this.isBrowser) return;

    this.hero = document.querySelector<HTMLElement>('.hero');
    this.about = document.querySelector<HTMLElement>('.about');
    this.lighting = document.querySelector<HTMLElement>('.cave-lighting');
    this.beam = document.querySelector<HTMLElement>('.light-beam');
    this.beamStart = document.querySelector<HTMLElement>('.beam-point-start');
    this.beamEnd = document.querySelector<HTMLElement>('.beam-point-end');
    this.watcherEye = document.querySelector<HTMLElement>('.watcher-eye');
    this.watcherIris = document.querySelector<HTMLElement>('.watcher-iris');

    this.illuminatedTargets = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.experiment-card, .cave-whisper, .instrument-panel-archive, ' +
        '.transmission-terminal, .tentacle-cluster'
      )
    );

    this.pointerX = window.innerWidth / 2;
    this.pointerY = window.innerHeight / 2;

    // Visual-only input work stays outside Angular change detection.
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.scheduleScrollUpdate, { passive: true });
      window.addEventListener('resize', this.scheduleScrollUpdate, { passive: true });
      document.addEventListener('mousemove', this.onPointerMove, { passive: true });
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      this.scheduleScrollUpdate(); // Handle reloads in the middle of the page.
    });
  }

  // Coalesce many scroll events into at most one update per animation frame.
  private scheduleScrollUpdate = (): void => {
    if (this.scrollFrame !== null) return;

    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = null;
      this.updateScrollState();
    });
  };

  private updateScrollState(): void {
    if (!this.hero || !this.lighting) return;

    const active = this.hero.getBoundingClientRect().bottom <= 0;
    this.lighting.classList.toggle('active', active);

    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = maxScroll > 0
      ? Math.max(0, Math.min(1, window.scrollY / maxScroll))
      : 0;

    document.documentElement.style.setProperty('--cave-darkness', String(0.08 + progress * 0.52));
    document.documentElement.style.setProperty('--beam-opacity', String(0.28 + progress * 0.22));

    const depth = Math.round(progress * 120);

    // THE AWAKENING SIGIL: 000m dormant -> 120m fully awake.
    // CSS variables avoid adding change-detection work on every scroll.
    const awakening = depth / 120;
    const root = document.documentElement;
    root.style.setProperty('--sigil-opacity', (0.55 + awakening * 0.45).toFixed(3));
    root.style.setProperty('--sigil-brightness', (0.75 + awakening * 1.05).toFixed(3));
    root.style.setProperty('--sigil-glow', `${(1 + awakening * 14).toFixed(2)}px`);
    root.style.setProperty('--sigil-eye-opacity', (0.04 + awakening * 0.93).toFixed(3));

    const nextDepth = String(depth).padStart(3, '0');
    const nextSignal = depth < 30 ? 'STABLE'
      : depth < 60 ? 'UNSTABLE'
      : depth < 90 ? 'WEAK'
      : 'UNKNOWN';

    const nextCompromised = this.about
      ? this.about.getBoundingClientRect().top <= -(window.innerHeight * 0.2)
      : false;

    // Update Angular bindings only when their values actually change.
    if (
      nextDepth !== this.depthDisplay ||
      nextSignal !== this.signal ||
      nextCompromised !== this.aboutCompromised
    ) {
      this.zone.run(() => {
        this.depthDisplay = nextDepth;
        this.signal = nextSignal;
        this.aboutCompromised = nextCompromised;
        this.cdr.markForCheck();
      });
    }

    // Always update, even if the About section is not on screen.
    this.updateExperimentReveals();

    // The UAV only hovers vertically. This loop follows that movement;
    // it does not add the horizontal patrol you decided against.
    if (active && !document.hidden) {
      this.startHoverTracking();
    } else {
      this.stopHoverTracking();
    }
  }

  // Collect the latest pointer position; calculate only once per frame.
  private onPointerMove = (event: MouseEvent): void => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;

    if (this.pointerFrame !== null) return;

    this.pointerFrame = requestAnimationFrame(() => {
      this.pointerFrame = null;
      this.updateWatcherPosition();

      if (this.lighting?.classList.contains('active')) {
        this.updateExperimentReveals();
      }
    });
  };

  private updateWatcherPosition(): void {
    if (!this.watcherEye || !this.watcherIris) return;

    const eye = this.watcherEye.getBoundingClientRect();
    const dx = this.pointerX - (eye.left + eye.width / 2);
    const dy = this.pointerY - (eye.top + eye.height / 2);
    const angle = Math.atan2(dy, dx);
    const distance = Math.min(7, Math.hypot(dx, dy));

    this.watcherIris.style.setProperty('--watcher-x', `${Math.cos(angle) * distance}px`);
    this.watcherIris.style.setProperty('--watcher-y', `${Math.sin(angle) * distance}px`);

    const screenCenter = window.innerWidth / 2;
    if (screenCenter > 0) {
      const beamAngle = Math.max(-60, Math.min(
        60,
        -((this.pointerX - screenCenter) / screenCenter) * 60
      ));
      document.documentElement.style.setProperty('--beam-angle', `${beamAngle}deg`);
    }
  }

  private updateExperimentReveals(): void {
    if (
      !this.lighting?.classList.contains('active') ||
      !this.beam || !this.beamStart || !this.beamEnd
    ) {
      for (const target of this.illuminatedTargets) {
        if (target.classList.contains('is-illuminated')) {
          target.classList.remove('is-illuminated');
        }
      }
      return;
    }

    const startRect = this.beamStart.getBoundingClientRect();
    const endRect = this.beamEnd.getBoundingClientRect();
    const startX = startRect.left;
    const startY = startRect.top;
    const dx = endRect.left - startX;
    const dy = endRect.top - startY;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return;

    const length = Math.sqrt(lengthSquared);
    const beamWidth = parseFloat(getComputedStyle(this.beam).width);

    for (const target of this.illuminatedTargets) {
      const rect = target.getBoundingClientRect();
      let illuminated = false;

      // Don't calculate five test points for an off-screen target.
      if (rect.bottom >= 0 && rect.top <= window.innerHeight &&
          rect.right >= 0 && rect.left <= window.innerWidth) {
        const insetX = rect.width * 0.2;
        const insetY = rect.height * 0.2;
        const points: [number, number][] = [
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
          [rect.left + insetX, rect.top + insetY],
          [rect.right - insetX, rect.top + insetY],
          [rect.left + insetX, rect.bottom - insetY],
          [rect.right - insetX, rect.bottom - insetY]
        ];

        illuminated = points.some(([x, y]) => {
          const relativeX = x - startX;
          const relativeY = y - startY;
          const progress = (relativeX * dx + relativeY * dy) / lengthSquared;
          if (progress < 0 || progress > 1) return false;

          const distance = Math.abs(relativeX * dy - relativeY * dx) / length;

          // Preserve the original hit detection for now. The visible beam
          // was recently narrowed; geometry can be tuned separately.
          const halfWidth = beamWidth * (0.1 + progress * 0.4);
          return distance <= halfWidth;
        });
      }

      if (target.classList.contains('is-illuminated') !== illuminated) {
        target.classList.toggle('is-illuminated', illuminated);
      }

      if (illuminated && target.classList.contains('transmission-terminal') &&
          this.transmissionStage() === 0) {
        this.zone.run(() => this.startTransmissionBoot());
      }
    }
  }

  // Recheck the slowly hovering beam at ~12fps even when the pointer is still.
  private startHoverTracking(): void {
    if (this.hoverFrame !== null) return;
    this.lastHoverCheck = 0;
    this.hoverFrame = requestAnimationFrame(this.trackHover);
  }

  private trackHover = (time: number): void => {
    this.hoverFrame = null;
    if (!this.lighting?.classList.contains('active') || document.hidden) return;

    if (time - this.lastHoverCheck >= 80) {
      this.updateExperimentReveals();
      this.lastHoverCheck = time;
    }
    this.hoverFrame = requestAnimationFrame(this.trackHover);
  };

  private stopHoverTracking(): void {
    if (this.hoverFrame !== null) cancelAnimationFrame(this.hoverFrame);
    this.hoverFrame = null;
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.stopHoverTracking();
    } else {
      this.scheduleScrollUpdate();
    }
  };

  // Called by the Final Transmission button or by the illuminated terminal.
  startTransmissionBoot(manual = false): void {
    if (!this.isBrowser || this.transmissionStage() !== 0) return;

    this.transmissionStage.set(1);
    // The activation button disappears during boot. Preserve keyboard focus
    // on the stable terminal instead of allowing it to jump to the page body.
    if (manual) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('.transmission-terminal')?.focus({ preventScroll: true });
      });
    }
    [2, 3, 4, 5, 6].forEach((stage, index) => {
      const timer = window.setTimeout(() => {
        this.transmissionStage.set(stage);
      }, (index + 1) * 900);
      this.bootTimers.push(timer);
    });
  }

  ngOnDestroy(): void {
    if (!this.isBrowser) return;

    window.removeEventListener('scroll', this.scheduleScrollUpdate);
    window.removeEventListener('resize', this.scheduleScrollUpdate);
    document.removeEventListener('mousemove', this.onPointerMove);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    if (this.scrollFrame !== null) cancelAnimationFrame(this.scrollFrame);
    if (this.pointerFrame !== null) cancelAnimationFrame(this.pointerFrame);
    this.stopHoverTracking();
    this.bootTimers.forEach(timer => clearTimeout(timer));
  }
}
