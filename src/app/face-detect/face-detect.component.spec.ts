import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { FaceDetectComponent } from './face-detect.component';

describe('FaceDetectComponent', () => {
  let component: FaceDetectComponent;
  let fixture: ComponentFixture<FaceDetectComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ FaceDetectComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(FaceDetectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
