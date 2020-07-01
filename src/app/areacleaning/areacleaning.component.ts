import { Component, OnInit } from "@angular/core";
import { HttpHeaders, HttpClient } from "@angular/common/http";
import { AuthenticationType } from "azure-maps-control";
import { MapService } from "../services/map.service";
import { positionElements } from "@ng-bootstrap/ng-bootstrap/util/positioning";
//import {} from "googlemaps";
declare var MapmyIndia: any; // Declaring Mapmyindia
declare var L: any; // Declaring L

// // azure
// import * as atlas from "azure-maps-control";
// import * as atlas1 from "azure-maps-rest";
// import { MapService } from "../services/map.service";

@Component({
  selector: "app-areacleaning",
  templateUrl: "./areacleaning.component.html",
  styleUrls: ["./areacleaning.component.css"]
})
export class AreacleaningComponent implements OnInit {
  key: string = "Gc8hPTz_23lDDzDOhLykSCDVt0HkYrlx62k_9dttLCw";
  map: any;
  mydatasource: any;
  //public map: any;
  setMaxLatitude;
  setMaxLongitude;
  userMaxLatitude;
  userMaxLongitude;
  userPositionLat;
  userPositionLong;
  private token: string;

  constructor(private http: HttpClient, private mapService: MapService) {}

  // // FOR USER'S LOCATION
  // showPosition(position) {
  //   this.userPositionLat = position.coords.latitude;
  //   this.userPositionLong = position.coords.longitude;
  //   console.log(
  //     "Latitude: " +
  //       position.coords.latitude +
  //       "<br>Longitude: " +
  //       position.coords.longitude
  //   );
  // }

  // getLocation() {
  //   if (navigator.geolocation) {
  //     navigator.geolocation.getCurrentPosition(position => {
  //       this.userPositionLat = position.coords.latitude;
  //       this.userPositionLong = position.coords.longitude;
  //     });
  //   } else {
  //     alert("Geolocation is not supported by this browser.");
  //   }
  // }
  // //  USER'S LOCATION FN END

  ngOnInit() {
    // garbage location
    this.setMaxLatitude = sessionStorage.getItem("setMaxLatitude");
    this.setMaxLongitude = sessionStorage.getItem("setMaxLongitude");
    console.log(this.setMaxLatitude, this.setMaxLongitude);
    //////////
    this.mapService.getPosition().then(pos => {
      console.log(`Positon: ${pos.lng} ${pos.lat}`);
      this.userPositionLat = pos.lat;
      this.userPositionLong = pos.lng;
      var pts = [
        new L.LatLng(this.setMaxLatitude, this.setMaxLongitude),
        new L.LatLng(this.userPositionLat, this.userPositionLong)
        //new L.LatLng(position.coords.latitude, position.coords.longitude)
      ];
      var polylineParam = {
        weight: 4, // The thickness of the polyline
        opacity: 1,
        color: "red" //The opacity of the polyline colour
      };
      var poly = new L.Polyline(pts, polylineParam);
      map.addLayer(poly);
      L.marker([this.setMaxLatitude, this.setMaxLongitude]).addTo(map);
    });
    ///////////

    // Creating Map
    var map = new MapmyIndia.Map("map", {
      center: [this.setMaxLatitude, this.setMaxLongitude],
      zoom: 6
      // marker: [28.04, 78.2]
    });
    this.mapService.getToken().then(data => {
      this.token = data["access_token"];
    });

    // user's location
    // this.getLocation();
  }
}
