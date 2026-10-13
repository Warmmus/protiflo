import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';

@Component({
  selector: 'app-eye',
  standalone: true,
  imports: [],
  templateUrl: './eye.html',
  styleUrl: './eye.css'
})
export class EyeComponent {

  @ViewChild('eye', { static: false })
  eye!: ElementRef;

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {

    const eyeElement = this.eye.nativeElement;

    const rect = eyeElement.getBoundingClientRect();

    const eyeX = rect.left + rect.width / 2;
    const eyeY = rect.top + rect.height / 2;

    const angle = Math.atan2(
      event.clientY - eyeY,
      event.clientX - eyeX
    );

    const distance = Math.min(
      20,
      Math.hypot(
        event.clientX - eyeX,
        event.clientY - eyeY
      )
    );

    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    eyeElement.style.setProperty(
      '--pupil-x',
      `${x}px`
    );

    eyeElement.style.setProperty(
      '--pupil-y',
      `${y}px`
    );
  }
}