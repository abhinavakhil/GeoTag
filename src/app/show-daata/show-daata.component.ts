import { Component, OnInit } from "@angular/core";
import { MapService } from "../services/map.service";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { ToastrService } from "ngx-toastr";
import { map } from "rxjs/operators";
import { Router } from "@angular/router";
import { keyframes } from "@angular/animations";
declare var MapmyIndia: any; // Declaring Mapmyindia
declare var L: any; // Declaring L

@Component({
  selector: "app-show-daata",
  templateUrl: "./show-daata.component.html",
  styleUrls: ["./show-daata.component.css"],
})
export class ShowDaataComponent implements OnInit {
  title = "DemoApp";
  //marker: any[];
  public map: any; // Initializing Map Variable
  constructor(
    private mapService: MapService,
    private http: HttpClient,
    private toastr: ToastrService,
    private router: Router
  ) {}
  private token: string;
  myUserData = [];
  MaxIntensity;
  MinIntensity;
  MaxLat = [];
  MaxLong = [];
  //api:string="atmlgu3gitp5lzw5k5yt9zdyf2hdc6jl";
  userLat = 28.04;
  userLong = 78.2;
  currentPingLat;
  currentPingLong;
  apiKey: string = "3f87366a73d25ffc9bcab9d01c6dcc10";
  apiResponse;
  pingCounter = [];
  email = [];

  ngOnInit(): void {
    //getting data on load
    this.http
      .get("https://geotag-781c6.firebaseio.com/pings.json")
      .subscribe((data) => {
        var response = data;
        var mydataresponse = Object.keys(response);
        var len = mydataresponse.length;

        for (var j = 0; j < len; j++) {
          var k = mydataresponse[j];
          this.MaxLat[j] = response[k].latitude;
          this.MaxLong[j] = response[k].longitude;
          this.pingCounter[j] = response[k].counter;
          this.email[j] = response[k].email;
        }
        console.log(this.MaxLat);
        this.map = new MapmyIndia.Map("map", {
          center: [28.04, 78.2],
          zoom: 2,
          // marker: [28.04, 78.2]
        });

        this.mapService.getToken().then((data) => {
          this.token = data["access_token"];
        });

        // Creating loop
        for (var i = 0; i < len; i++) {
          //console.log(this.MaxLat);
          var mk = L.marker([this.MaxLat[i], this.MaxLong[i]]).addTo(this.map);
          /////////////////////

          var create_content = function (tittle, Long, Lat) {
            var h = new Array();
            h.push("<div>");
            h.push('<div class="header">');
            h.push("<span>");
            h.push(tittle);
            h.push("</span> ");
            h.push("</div>");
            h.push('<div class="info_css">');
            h.push(Long);
            h.push(",");
            h.push(Lat);
            h.push("</div>");
            h.push("</div>");
            return h.join("");
          };
          //

          this.currentPingLat = this.MaxLat[0];
          this.currentPingLong = this.MaxLong[0];
          this.http
            .get(
              `https://api.openweathermap.org/data/2.5/weather?lat=${this.currentPingLat}&lon=${this.currentPingLong}&appid=${this.apiKey}`
            )
            .subscribe(function (data) {
              this.apiResponse = data;
            });

          //var cityData = sessionStorage.getItem("mydatakey");
          sessionStorage.setItem("setMaxLatitude", this.currentPingLat);
          sessionStorage.setItem("setMaxLongitude", this.currentPingLong);
          var content = create_content(
            this.pingCounter[i],
            this.currentPingLat,
            this.currentPingLong
          );

          mk.bindPopup(content);
          mk.openPopup();

          const currentDiameter = L.circle([this.MaxLat[i], this.MaxLong[i]], {
            color: "red",
            fillOpacity: this.pingCounter[i], //percent value in 0-1
            // randomData: Math.floor(Math.random() * 10 + 1),
            fillColor:
              Math.floor(Math.random() * 10 + 1) > 4 ? "#ffb5c2" : "#b5e7ff",
            //function() {
            //   return this.fillOpacity > 0.1 ? "#ffb5c2" : "#b5e7ff";
            // },

            //["#ffb5c2","#b5e7ff","#e7ffb5"], this["fillOpacity"] > 0.5 ? "#ffb5c2" : "#b5e7ff"
            radius: 50,
          });
          // calling fillColor fn
          //  alert(currentDiameter.;
          // end
          currentDiameter.addTo(this.map);
          this.map.fitBounds(currentDiameter.getBounds());
        }
      });
  }

  move() {
    this.router.navigate(["/detect"]);
  }
}
