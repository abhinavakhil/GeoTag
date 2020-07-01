import { Component, OnInit } from "@angular/core";
import { AuthService } from "../services/auth.service";
import { MapService } from "../services/map.service";
import { ToastrService } from "ngx-toastr";
import { HttpClient, HttpHeaders } from "@angular/common/http";

declare var MapmyIndia: any; // Declaring Mapmyindia
declare var L: any; // Declaring L
@Component({
  selector: "app-home",
  templateUrl: "./home.component.html",
  styleUrls: ["./home.component.css"],
})
export class HomeComponent implements OnInit {
  title = "DemoApp";
  toastAlert: boolean = false;
  //marker: any[];
  public map: any; // Initializing Map Variable
  constructor(
    private mapService: MapService,
    private http: HttpClient,
    private toastr: ToastrService
  ) {}
  private token: string;
  ngOnInit(): void {
    // Creating Map
    this.map = new MapmyIndia.Map("map", {
      center: [28.04, 78.2],
      zoom: 4,
      // marker: [28.04, 78.2]
    });
    const marker = L.marker([28.04, 78.2]).addTo(this.map);

    this.mapService.getToken().then((data) => {
      this.token = data["access_token"];
    });
  }
  auto() {
    this.mapService.autoSuggest(this.token).then((data) => {
      console.log(data);
    });
  }
  //
  userLocation;
  myLocationData: any[];
  lat;
  long;
  counter = 0;

  nearby() {
    this.mapService.nearby(this.token).then(
      (data) => {
        console.log(data);
        //this.userLocation.push(data);
        this.userLocation = data["explanation"].refLocation;
        this.myLocationData = this.userLocation.split(",");
        this.lat = this.myLocationData[0];
        this.long = this.myLocationData[1];
        localStorage.setItem("userLat", this.lat);
        localStorage.setItem("userLong", this.long);
        //console.log(this.lat, this.long);
        L.marker([this.lat, this.long]).addTo(this.map);

        // marker.setLatLng([this.lat,this.long]);
        // const currentDiameter  = L.circle

        // marker.setLatLng([this.lat, this.long]);
        const currentDiameter = L.circle([this.lat, this.long], {
          color: "green",
          fillColor: "#FFC0CB",
          fillOpacity: 0.5,
          radius: 100,
        });

        currentDiameter.addTo(this.map);
        this.map.fitBounds(currentDiameter.getBounds());

        const userEmail = sessionStorage.getItem("myemail");
        console.log(userEmail);
        this.counter = this.counter + 1;
        //header
        var headers = new HttpHeaders({
          "Content-Type": "application/json",
          Accept: "application/json",
        });
        this.http
          .post(
            "https://geotag-781c6.firebaseio.com/pings.json",
            {
              email: userEmail,
              latitude: this.lat,
              longitude: this.long,
              counter: this.counter,
            },
            { headers }
          )
          .subscribe((data) => {
            console.log(data);
          });

        this.toastr.success("successfully added waste location");
      }

      //circle function
    );
  }
}
