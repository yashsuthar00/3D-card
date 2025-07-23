'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';
import CannonDebugger from 'cannon-es-debugger';

const HangingCardCanvas: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mountRef.current) return;
        const mountNode = mountRef.current;

        // --- Basic Setup ---
        let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, controls: OrbitControls;
        let world: CANNON.World, spring: CANNON.Spring, cannonDebugger: ReturnType<typeof CannonDebugger>;
        let cardMesh: THREE.Mesh, cardBody: CANNON.Body, anchorBody: CANNON.Body;
        let ropeLine: THREE.Line;
        let isDragging = false;
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const dragPlane = new THREE.Plane();
        const intersectionPoint = new THREE.Vector3();

        // --- Main Initialization ---
        const init = () => {
            // Scene
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1a1a1a);
            scene.fog = new THREE.Fog(0x1a1a1a, 20, 100);

            // Camera
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 10, 20);

            // Renderer
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.shadowMap.enabled = true;
            mountNode.appendChild(renderer.domElement);

            // Controls
            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.target.set(0, 10, 0);

            // Lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambientLight);
            const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
            dirLight.position.set(10, 20, 5);
            dirLight.castShadow = true;
            scene.add(dirLight);

            initPhysics();
            initVisuals();
            initEventListeners();
            animate();
        };

        // --- Physics World Setup (cannon-es) ---
        const initPhysics = () => {
            world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });

            anchorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Sphere(0.1), position: new CANNON.Vec3(0, 25, 0) });
            world.addBody(anchorBody);

            const cardShape = new CANNON.Box(new CANNON.Vec3(4, 5, 0.1));
            cardBody = new CANNON.Body({ mass: 2, shape: cardShape, position: new CANNON.Vec3(0, 15, 0), angularDamping: 0.5 });
            world.addBody(cardBody);

            spring = new CANNON.Spring(anchorBody, cardBody, { restLength: 5, stiffness: 80, damping: 2 });

            cannonDebugger = CannonDebugger(scene, world, { color: 0xff0000 });
        };

        // --- Visual Objects Setup (three.js) ---
        const initVisuals = () => {
            const cardGeometry = new THREE.BoxGeometry(8, 10, 0.2);
            const cardMaterial = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5, metalness: 0.1 });
            cardMesh = new THREE.Mesh(cardGeometry, cardMaterial);
            cardMesh.castShadow = true;
            cardMesh.receiveShadow = true;
            scene.add(cardMesh);

            const ropeGeometry = new THREE.BufferGeometry();
            const points = [new THREE.Vector3(), new THREE.Vector3()];
            ropeGeometry.setFromPoints(points);
            const ropeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
            ropeLine = new THREE.Line(ropeGeometry, ropeMaterial);
            scene.add(ropeLine);

            const groundGeo = new THREE.PlaneGeometry(100, 100);
            const groundMat = new THREE.ShadowMaterial({ opacity: 0.4 });
            const groundMesh = new THREE.Mesh(groundGeo, groundMat);
            groundMesh.rotation.x = -Math.PI / 2;
            groundMesh.position.y = -2;
            groundMesh.receiveShadow = true;
            scene.add(groundMesh);
        };

        // --- Event Listeners for Interaction ---
        const initEventListeners = () => {
            window.addEventListener('resize', onWindowResize);
            renderer.domElement.addEventListener('pointerdown', onPointerDown);
            renderer.domElement.addEventListener('pointermove', onPointerMove);
            renderer.domElement.addEventListener('pointerup', onPointerUp);
        };

        const onWindowResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };

        const onPointerDown = (event: PointerEvent) => {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(cardMesh);
            if (intersects.length > 0) {
                isDragging = true;
                controls.enabled = false;
                cardBody.type = CANNON.Body.KINEMATIC;
            }
        };

        const onPointerMove = (event: PointerEvent) => {
            if (isDragging) {
                mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
                dragPlane.setFromNormalAndCoplanarPoint(
                    camera.getWorldDirection(dragPlane.normal),
                    new THREE.Vector3(cardBody.position.x, cardBody.position.y, cardBody.position.z)
                );
                raycaster.setFromCamera(mouse, camera);
                raycaster.ray.intersectPlane(dragPlane, intersectionPoint);
                cardBody.position.copy(intersectionPoint as unknown as CANNON.Vec3);
            }
        };

        const onPointerUp = () => {
            if (isDragging) {
                isDragging = false;
                controls.enabled = true;
                cardBody.type = CANNON.Body.DYNAMIC;
            }
        };

        // --- Animation Loop ---
        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            world.step(1 / 60);
            spring.applyForce();
            cannonDebugger.update();

            cardMesh.position.copy(cardBody.position as unknown as THREE.Vector3);
            cardMesh.quaternion.copy(cardBody.quaternion as unknown as THREE.Quaternion);

            const ropePositions = (ropeLine.geometry.attributes.position as THREE.BufferAttribute).array;
            const anchorPos = anchorBody.position;
            const cardPos = cardBody.position;
            ropePositions[0] = anchorPos.x;
            ropePositions[1] = anchorPos.y;
            ropePositions[2] = anchorPos.z;
            ropePositions[3] = cardPos.x;
            ropePositions[4] = cardPos.y;
            ropePositions[5] = cardPos.z;
            (ropeLine.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

            renderer.render(scene, camera);
        };

        init();

        // Cleanup function
        return () => {
            window.removeEventListener('resize', onWindowResize);
            renderer.domElement.removeEventListener('pointerdown', onPointerDown);
            renderer.domElement.removeEventListener('pointermove', onPointerMove);
            renderer.domElement.removeEventListener('pointerup', onPointerUp);
            mountNode.removeChild(renderer.domElement);
        };
    }, []);

    return <div ref={mountRef} style={{ width: '100vw', height: '100vh' }} />;
};

export default HangingCardCanvas;
