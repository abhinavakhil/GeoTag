import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
@Injectable({
  providedIn: "root"
})
export class MapService {
  constructor(private httpClient: HttpClient) {}
  private grantType: string = "client_credentials";

  private clientId: string =
    "J1nb1xg3kk6e_ya-htttfXviD-nAvLVyUVEzjss09QMSaQc11n4TPvs1bo9Rt9SIfipS2Vmjj_WgS7meQBmv2w==";
  private clientSecret: string =
    "ebEc8GH231cyr8m3lRyHO77zqoEeTC_kOCR3vm9RFX5FE57IaAOEhGqMLb0ayuwhPQq5-RSqJILi5ibjeO_zSlKcbEY29gHa";
  private securityURL: string =
    "https://outpost.mapmyindia.com/api/security/v3.0.5/oauth/token?grant_type=" +
    this.grantType +
    "&client_id=" +
    this.clientId +
    "&client_secret=" +
    this.clientSecret;
  private autoSuggestURL: string =
    "https://atlas.mapmyindia.com/api/places/search/json?";
  // "https://atlas.mapmyindia.com/api/places/search/json?query=agra&location=28.5454,77.455454&bridge&explain&username=balmukand";
  private nearbyURL: string =
    "https://atlas.mapmyindia.com/api/places/nearby/json?explain&richData&username=balmukand&refLocation=28.467470,77.077518&keywords=FINATM";

  getToken() {
    let promise = new Promise((resolve, reject) => {
      let apiURL = this.securityURL;
      this.httpClient
        .post(apiURL, null)
        .toPromise()
        .then(res => {
          // Success
          resolve(res);
        });
    });
    return promise;
  }

  autoSuggest(token: string) {
    const _url = this.autoSuggestURL + "&access_token=" + token;
    const promise = new Promise((resolve, reject) => {
      this.httpClient
        .get(_url)
        .toPromise()
        .then(res => {
          // Success
          console.log(res);
          resolve(res);
        });
    });
    return promise;
  }

  nearby(token: string) {
    const _url = this.nearbyURL + "&access_token=" + token;
    const promise = new Promise((resolve, reject) => {
      this.httpClient
        .get(_url)
        .toPromise()
        .then(res => {
          // Success
          //console.log(res);
          resolve(res);
        });
    });
    return promise;
  }

  // current loc
  getPosition(): Promise<any> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resp => {
          resolve({ lng: resp.coords.longitude, lat: resp.coords.latitude });
        },
        err => {
          reject(err);
        }
      );
    });
  }
}
