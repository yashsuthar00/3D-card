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
        let world: CANNON.World, cannonDebugger: ReturnType<typeof CannonDebugger>;
        let cardMesh: THREE.Mesh, cardBody: CANNON.Body, anchorBody: CANNON.Body;
        let ropeLine: THREE.Line;
        const ropeSegments: CANNON.Body[] = [];
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
            // Disable all camera controls and zoom
            controls.enabled = false;
            controls.enableZoom = false;
            controls.enablePan = false;
            controls.enableRotate = false;

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

            anchorBody = new CANNON.Body({
                mass: 0,
                shape: new CANNON.Sphere(0.1),
                position: new CANNON.Vec3(0, 25, 0),
                collisionFilterGroup: 0,
                collisionFilterMask: 0
            });
            world.addBody(anchorBody);

            const cardShape = new CANNON.Box(new CANNON.Vec3(4, 5, 0.1));
            cardBody = new CANNON.Body({
                mass: 2,
                shape: cardShape,
                position: new CANNON.Vec3(0, 15, 0),
                angularDamping: 0.5,
                angularFactor: new CANNON.Vec3(1, 1, 0), // Only allow rotation in X and Y
                linearFactor: new CANNON.Vec3(1, 1, 0) // Only allow translation in X and Y
            });
            world.addBody(cardBody);

            // --- Create the rope as a chain of segments using DistanceConstraints ---
            const numSegments = 15;
            const segmentLength = 0.6;
            const segmentMass = 0.1;
            const segmentShape = new CANNON.Sphere(0.1);
            const anchorPos = anchorBody.position;
            let previousSegment: CANNON.Body | null = null;

            for (let i = 0; i < numSegments; i++) {
                const segment = new CANNON.Body({
                    mass: i === 0 ? 0 : segmentMass,
                    shape: segmentShape,
                    position: new CANNON.Vec3(anchorPos.x, anchorPos.y - (i * segmentLength), anchorPos.z),
                    linearDamping: 0.5,
                    angularDamping: 0.5,
                    collisionFilterGroup: 1,
                    collisionFilterMask: 1
                });
                ropeSegments.push(segment);
                world.addBody(segment);

                if (previousSegment) {
                    // Use DistanceConstraint for rigid connection
                    const constraint = new CANNON.DistanceConstraint(previousSegment, segment, segmentLength);
                    world.addConstraint(constraint);
                }
                previousSegment = segment;
            }

            // Connect first segment to anchorBody (fixed upper point)
            const firstSegment = ropeSegments[0];
            const anchorConstraint = new CANNON.DistanceConstraint(anchorBody, firstSegment, 0);
            world.addConstraint(anchorConstraint);

            // Connect last rope segment to the top of the card
            const cardTopLocal = new CANNON.Vec3(0, 5, 0);
            const lastSegment = ropeSegments[ropeSegments.length - 1];
            // For card, use a PointToPointConstraint to attach to the top
            const cardConstraint = new CANNON.PointToPointConstraint(
                lastSegment, new CANNON.Vec3(0, 0, 0),
                cardBody, cardTopLocal
            );
            world.addConstraint(cardConstraint);

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

            // Rope line with multiple segments
            const ropeGeometry = new THREE.BufferGeometry();
            const points = new Float32Array((ropeSegments.length + 2) * 3); // +2 for anchor and card top
            ropeGeometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
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
            cannonDebugger.update();
            cardMesh.position.copy(cardBody.position as unknown as THREE.Vector3);
            cardMesh.quaternion.copy(cardBody.quaternion as unknown as THREE.Quaternion);

            // Draw rope: anchor -> all segments -> card top
            const ropePositions = (ropeLine.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
            // Anchor point
            ropePositions[0] = anchorBody.position.x;
            ropePositions[1] = anchorBody.position.y;
            ropePositions[2] = anchorBody.position.z;
            // Rope segments
            for (let i = 0; i < ropeSegments.length; i++) {
                const segmentPos = ropeSegments[i].position;
                ropePositions[(i + 1) * 3] = segmentPos.x;
                ropePositions[(i + 1) * 3 + 1] = segmentPos.y;
                ropePositions[(i + 1) * 3 + 2] = segmentPos.z;
            }
            // Card top in world space
            const cardTop = new THREE.Vector3(0, 5, 0).applyQuaternion(cardMesh.quaternion).add(cardMesh.position);
            ropePositions[(ropeSegments.length + 1) * 3] = cardTop.x;
            ropePositions[(ropeSegments.length + 1) * 3 + 1] = cardTop.y;
            ropePositions[(ropeSegments.length + 1) * 3 + 2] = cardTop.z;
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
