import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { AreacleaningComponent } from './areacleaning.component';

describe('AreacleaningComponent', () => {
  let component: AreacleaningComponent;
  let fixture: ComponentFixture<AreacleaningComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ AreacleaningComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AreacleaningComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
