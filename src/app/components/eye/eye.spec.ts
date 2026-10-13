import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Eye } from './eye';

describe('Eye', () => {
  let component: Eye;
  let fixture: ComponentFixture<Eye>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Eye],
    }).compileComponents();

    fixture = TestBed.createComponent(Eye);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
