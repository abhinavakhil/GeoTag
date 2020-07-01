import { TestBed } from '@angular/core/testing';

import { ComputerVisionService } from './computer-vision.service';

describe('ComputerVisionService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: ComputerVisionService = TestBed.get(ComputerVisionService);
    expect(service).toBeTruthy();
  });
});
