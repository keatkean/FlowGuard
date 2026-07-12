import React from "react";
import NavBar from "../components/NavBar";
import Hero from "../components/Hero";
import ImpactStats from "../components/ImpactStats";
import FeatureCards from "../components/FeatureCards";
import Footer from "../components/Footer";
import ContactForm from "../components/ContactForm";
import LiveStatus from "../components/LiveStatus";
import Roadmap from "../components/Roadmap";
import TechStack from "../components/TechStack";
import HowItWorks from "../components/HowItWorks";

const Home = () => {
  return (
    <main>
      <NavBar />
      <Hero />
      <LiveStatus />
      <ImpactStats /> 
      <FeatureCards />
      <HowItWorks />
      <Roadmap />
      <TechStack />
      <ContactForm />
      <Footer />
    </main>
  );
};

export default Home;
