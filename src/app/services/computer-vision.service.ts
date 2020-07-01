import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { ImageAnalisys } from "../services/cognitive-api";
import { FileUpload } from "../services/FileUpload";
import { Observable } from "rxjs";
import { environment } from "../../environments/environment";

@Injectable({
  providedIn: "root"
})
export class ComputerVisionService {
  constructor(private http: HttpClient) {}
}
