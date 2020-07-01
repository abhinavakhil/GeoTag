import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ShowDaataComponent } from './show-daata.component';

describe('ShowDaataComponent', () => {
  let component: ShowDaataComponent;
  let fixture: ComponentFixture<ShowDaataComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ShowDaataComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ShowDaataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
