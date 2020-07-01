import { NgModule } from "@angular/core";
import { Routes, RouterModule } from "@angular/router";
import { LoginComponent } from "./login/login.component";
import { HomeComponent } from "./home/home.component";
import { AreacleaningComponent } from "./areacleaning/areacleaning.component";
import { ShowDaataComponent } from "./show-daata/show-daata.component";

const routes: Routes = [
  { path: "", component: LoginComponent },
  { path: "home", component: HomeComponent },
  { path: "detect", component: AreacleaningComponent },
  { path: "showData", component: ShowDaataComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
