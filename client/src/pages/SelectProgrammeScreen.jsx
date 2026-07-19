// src/pages/SelectProgrammeScreen.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageBackground from '../features/programmeSelection/components/pageBackground';
import PageHeader from '../features/programmeSelection/components/pageHeader';
import ProgrammeCard from '../features/programmeSelection/components/programmeCard';
import nocImage from '../assets/nourish_our_children.png';
import ftsImage from '../assets/feed_the_soil.png';
import laImage from '../assets/love_activism.png';

const PROGRAMMES = [
  {
    tag: 'NOC',
    title: 'Nourish Our Children',
    description: 'Log deliveries, decants, packing and ECD collections.',
    image: nocImage,
    path: '/programmes/nourish-our-children',
  },
  {
    tag: 'FTS',
    title: 'Feed the Soil',
    description: 'Track compost intake and stock levels.',
    image: ftsImage,
    path: '/programmes/feed-the-soil',
  },
  {
    tag: 'LA',
    title: 'Love Activism',
    description: "Help with today's volunteer tasks and packing.",
    image: laImage,
    path: '/programmes/love-activism',
  },
];

const GREETINGS = [
  'Every meal starts with someone who cares.',
  'Ready to make a difference today?',
  "Together we're feeding communities.",
  'Small actions. Big impact.',
  'Thank you for helping nourish South Africa.',
  'Another day to change lives.',
  "Welcome back! Let's get to work.",
  'Every parcel matters.',
  'Helping hands. Hope delivered.',
  "Today's work creates tomorrow's smiles.",
  'Good to see you again.',
  'Making every donation count.',
  'Your work keeps communities moving.',
  'Ready to support our programmes today?',
  'Compassion in action starts here.',
];

const ProgrammeSelectPage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [greeting] = useState(() => {
    const savedGreeting = sessionStorage.getItem('programmeGreeting');

    if (savedGreeting) {
      return savedGreeting;
    }

    const randomGreeting =
      GREETINGS[Math.floor(Math.random() * GREETINGS.length)];

    sessionStorage.setItem('programmeGreeting', randomGreeting);

    return randomGreeting;
  });

  const handleLogout = async () => {
    sessionStorage.removeItem('programmeGreeting');
    await logout();
    navigate('/login');
  };

  return (
    <PageBackground flow>
      <PageHeader
        showBack={false}
        onLogout={handleLogout}
        onInfo={() => navigate('/programmes/info')}
      />

      <main className="programme-select-content">
        <h1 className="programme-select-eyebrow">
          {greeting}
        </h1>

        <h1 className="programme-select-heading">
          Hi, {user?.name || ''}!
        </h1>

        <p className="programme-select-subtitle">
          What would you like to do today?
        </p>

        {PROGRAMMES.map((programme) => (
          <ProgrammeCard
            key={programme.tag}
            tag={programme.tag}
            title={programme.title}
            description={programme.description}
            image={programme.image}
            onInfo={() => navigate(`${programme.path}/info`)}
            onOpen={() => navigate(programme.path)}
          />
        ))}
      </main>
    </PageBackground>
  );
};

export default ProgrammeSelectPage;