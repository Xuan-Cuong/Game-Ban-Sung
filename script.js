// File: script.js

// Lấy phần tử canvas và UI
const canvas = document.getElementById("renderCanvas");
const scoreUI = document.getElementById("score");
const gameOverUI = document.getElementById("gameOver");
const instructionsUI = document.getElementById("instructions");

// Tạo Babylon.js Engine
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

// --- Biến toàn cục cho game ---
let scene;
let camera;
let gunMesh;
let inputMap = {};
let score = 0;
let gameOver = false;
let targets = [];
let projectiles = [];
let isPointerLocked = false;

// --- Hằng số game ---
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.5;
const PLAYER_SPEED = 8.0;
const MOUSE_SENSITIVITY = 0.0005;
const GRAVITY = -9.81 * 2;
const JUMP_FORCE = 1.5; // Tăng nhẹ lực nhảy

const PROJECTILE_SPEED = 35.0; // Tăng tốc độ đạn
const PROJECTILE_LIFETIME = 1.8; // Giảm thời gian sống
const FIRE_RATE = 180; // Tăng tốc độ bắn nhẹ
let lastFireTime = 0;

const TARGET_COUNT = 20;
const MOVING_TARGET_RATIO = 0.4;
const TARGET_MIN_SPEED = 3.0; // Tăng tốc độ mục tiêu
const TARGET_MAX_SPEED = 7.0;

// Hàm tạo Scene chính
const createScene = function () {
    scene = new BABYLON.Scene(engine);
    // Tối ưu hóa scene một chút
    scene.blockMaterialDirtyMechanism = true;
    scene.gravity = new BABYLON.Vector3(0, GRAVITY / engine.getFps(), 0);
    scene.collisionsEnabled = true;

    // --- Camera FPS ---
    camera = new BABYLON.FreeCamera("playerCamera", new BABYLON.Vector3(0, PLAYER_HEIGHT, -10), scene);
    camera.applyGravity = true;
    camera.checkCollisions = true;
    camera.ellipsoid = new BABYLON.Vector3(PLAYER_RADIUS, PLAYER_HEIGHT / 2, PLAYER_RADIUS);
    camera.ellipsoidOffset = new BABYLON.Vector3(0, PLAYER_HEIGHT / 2, 0); // Đẩy ellipsoid lên đúng vị trí chân
    camera.minZ = 0.45;
    camera.angularSensibility = 7000; // Điều chỉnh độ nhạy
    camera.speed = 0; // Tự quản lý tốc độ
    camera.inputs.clear(); // Xóa input mặc định

    // --- Ánh sáng ---
    const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0.5, 1, 0.2), scene); // Hướng sáng tốt hơn
    light.intensity = 0.9;
    // Bỏ point light để tăng hiệu năng, hemispheric là đủ cho scene đơn giản
    // const pointLight = new BABYLON.PointLight("pointLight", new BABYLON.Vector3(0, 5, -5), scene);
    // pointLight.intensity = 0.5;

    // --- Môi trường (Ground và tường) ---
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 100, height: 100 }, scene);
    ground.checkCollisions = true;
    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/ground.jpg", scene);
    groundMat.diffuseTexture.uScale = 10;
    groundMat.diffuseTexture.vScale = 10;
    groundMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Giảm phản chiếu nền
    ground.material = groundMat;
    ground.receiveShadows = true; // Cho phép nhận bóng đổ (nếu có shadow generator)

    const wallHeight = 5;
    const wallThickness = 1;
    const wallMat = new BABYLON.StandardMaterial("wallMat", scene);
    wallMat.diffuseTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/bricktile.jpg", scene);
    wallMat.diffuseTexture.uScale = 15; // Điều chỉnh scale texture
    wallMat.diffuseTexture.vScale = 1.5;
    wallMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    wallMat.backFaceCulling = false; // Render cả mặt sau của tường

    const walls = []; // Nhóm các tường lại
    walls.push(BABYLON.MeshBuilder.CreateBox("wallN", { width: 100, height: wallHeight, depth: wallThickness }, scene));
    walls.push(BABYLON.MeshBuilder.CreateBox("wallS", { width: 100, height: wallHeight, depth: wallThickness }, scene));
    walls.push(BABYLON.MeshBuilder.CreateBox("wallE", { width: wallThickness, height: wallHeight, depth: 100 + wallThickness }, scene)); // Tăng chiều dài tường biên
    walls.push(BABYLON.MeshBuilder.CreateBox("wallW", { width: wallThickness, height: wallHeight, depth: 100 + wallThickness }, scene));

    walls[0].position = new BABYLON.Vector3(0, wallHeight / 2, 50);
    walls[1].position = new BABYLON.Vector3(0, wallHeight / 2, -50);
    walls[2].position = new BABYLON.Vector3(50, wallHeight / 2, 0);
    walls[3].position = new BABYLON.Vector3(-50, wallHeight / 2, 0);

    walls.forEach(wall => {
        wall.checkCollisions = true;
        wall.material = wallMat;
    });

    // --- Tạo Mô hình Súng đơn giản ---
    createGunModel();

    // --- Tạo Mục tiêu ---
    createTargets(TARGET_COUNT);

    // --- Thiết lập Input ---
    setupInput();

    // --- Logic Game Loop ---
    scene.onBeforeRenderObservable.add(() => {
        if (!engine.isPointerLock) { // Nếu chuột không bị khóa (ví dụ: mất focus, nhấn Esc)
             isPointerLocked = false;
             // Hiện lại hướng dẫn nếu chưa game over
             if (!gameOver && instructionsUI.style.display !== 'block') {
                 instructionsUI.style.display = 'block';
             }
             // Dừng di chuyển ngang
             camera.cameraDirection.x = 0;
             camera.cameraDirection.z = 0;
             inputMap = {}; // Reset trạng thái phím
        } else {
            isPointerLocked = true; // Đảm bảo trạng thái đúng
            if (instructionsUI.style.display !== 'none') {
                 instructionsUI.style.display = 'none'; // Ẩn hướng dẫn
            }
        }


        if (!gameOver) {
            const deltaTime = engine.getDeltaTime() / 1000.0;

            if (isPointerLocked) { // Chỉ xử lý movement/projectiles khi chuột khóa
                 handleMovement(deltaTime);
                 updateProjectiles(deltaTime);
            } else {
                // Khi không khóa chuột, vẫn cho phép trọng lực tác dụng
                // handleMovement sẽ không áp dụng di chuyển ngang
                 handleMovement(deltaTime); // Gọi để xử lý trọng lực/dừng di chuyển ngang
            }

            updateMovingTargets(deltaTime); // Mục tiêu luôn di chuyển
            checkGameOver();

        } else {
            // Game Over State
            camera.cameraDirection.x = 0;
            camera.cameraDirection.z = 0;
            // Cho phép trọng lực nếu muốn nhân vật rơi xuống khi thua
        }
    });

    return scene;
};

function createGunModel() {
    gunMesh = new BABYLON.TransformNode("gunRoot", scene);
    gunMesh.parent = camera;
    gunMesh.position = new BABYLON.Vector3(0.35, -0.35, 1.1); // Điều chỉnh vị trí súng
    gunMesh.rotation = new BABYLON.Vector3(0, -0.02, 0); // Hơi xoay súng vào trong

    const gunMat = new BABYLON.StandardMaterial("gunMat", scene);
    gunMat.diffuseColor = new BABYLON.Color3(0.25, 0.25, 0.3);
    gunMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

    const gunBody = BABYLON.MeshBuilder.CreateBox("gunBody", { width: 0.18, height: 0.28, depth: 0.7 }, scene);
    gunBody.material = gunMat;
    gunBody.parent = gunMesh;

    const gunBarrel = BABYLON.MeshBuilder.CreateCylinder("gunBarrel", { height: 0.65, diameter: 0.09 }, scene);
    gunBarrel.material = gunMat;
    gunBarrel.parent = gunMesh;
    gunBarrel.rotation.x = Math.PI / 2;
    gunBarrel.position = new BABYLON.Vector3(0, 0.07, 0.68); // Vị trí nòng súng

    // Ẩn súng khỏi các phép tính va chạm và raycast không cần thiết
    gunMesh.isPickable = false;
    gunBody.isPickable = false;
    gunBarrel.isPickable = false;

    gunMesh.renderingGroupId = 1;
    gunBody.renderingGroupId = 1;
    gunBarrel.renderingGroupId = 1;
}

function createTargets(count) {
    const targetMat = new BABYLON.StandardMaterial("targetMat", scene);
    targetMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.2);
    targetMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.05);

    const movingTargetMat = new BABYLON.StandardMaterial("movingTargetMat", scene);
    movingTargetMat.diffuseColor = new BABYLON.Color3(0.2, 0.8, 1.0);
    movingTargetMat.specularColor = new BABYLON.Color3(0.1, 0.3, 0.4);

    const targetDiameter = 1.6; // Tăng nhẹ kích thước
    const targetHeight = 0.1;
    const playAreaSize = 85; // Phạm vi mục tiêu
    const padding = 8; // Khoảng cách tối thiểu từ tường
    const minMoveDist = 20; // Khoảng cách di chuyển A-B tối thiểu

    for (let i = 0; i < count; i++) {
        const target = BABYLON.MeshBuilder.CreateCylinder("target" + i, { diameter: targetDiameter, height: targetHeight, tessellation: 32 }, scene); // Tăng tessellation

        const isMoving = Math.random() < MOVING_TARGET_RATIO;
        const posY = 0.6 + targetDiameter / 2 + Math.random() * 3.5; // Nâng cao vị trí Y một chút

        target.metadata = {
            points: isMoving ? 3 : 1,
            isMoving: isMoving,
            pointA: null,
            pointB: null,
            currentTarget: null,
            moveSpeed: 0
        };

        if (isMoving) {
            target.material = movingTargetMat;
            target.metadata.moveSpeed = TARGET_MIN_SPEED + Math.random() * (TARGET_MAX_SPEED - TARGET_MIN_SPEED);

            let distSq = 0;
            let posAX, posAZ, posBX, posBZ;
            while (distSq < minMoveDist * minMoveDist) {
                posAX = padding + Math.random() * (playAreaSize - 2 * padding) - playAreaSize / 2;
                posAZ = padding + Math.random() * (playAreaSize - 2 * padding) - playAreaSize / 2;
                posBX = padding + Math.random() * (playAreaSize - 2 * padding) - playAreaSize / 2;
                posBZ = padding + Math.random() * (playAreaSize - 2 * padding) - playAreaSize / 2;
                // Đảm bảo điểm B không quá gần điểm A ngay từ đầu
                const vecA = new BABYLON.Vector3(posAX, posY, posAZ);
                const vecB = new BABYLON.Vector3(posBX, posY, posBZ);
                distSq = BABYLON.Vector3.DistanceSquared(vecA, vecB);
            }

            target.metadata.pointA = new BABYLON.Vector3(posAX, posY, posAZ);
            target.metadata.pointB = new BABYLON.Vector3(posBX, posY, posBZ);
            target.metadata.currentTarget = target.metadata.pointB;
            target.position = target.metadata.pointA.clone();
        } else {
            target.material = targetMat;
            const posX = (Math.random() - 0.5) * playAreaSize;
            const posZ = (Math.random() - 0.5) * playAreaSize;
            target.position = new BABYLON.Vector3(posX, posY, posZ);
        }

        target.rotation.x = Math.PI / 2;
        // Không cho target tự va chạm với người chơi hoặc đạn (va chạm đạn xử lý bằng raycast)
        target.checkCollisions = false;
        target.isPickable = true; // Cho phép raycast bắn trúng
        targets.push(target);
    }
}


function setupInput() {
    // Xử lý nhấn phím
    window.addEventListener("keydown", (event) => {
        if (gameOver) return; // Không xử lý input khi game over
        inputMap[event.key.toLowerCase()] = true;

        // Nhảy
        if (event.key === " " && isPointerLocked) {
             // Raycast ngắn xuống dưới để kiểm tra đất
             const rayStart = camera.position.clone();
             const ray = new BABYLON.Ray(rayStart, new BABYLON.Vector3(0, -1, 0), PLAYER_HEIGHT / 2 + 0.1); // Chiều dài ray chính xác hơn
             const hit = scene.pickWithRay(ray, (mesh) => mesh.isPickable && mesh.checkCollisions && mesh !== camera); // Loại trừ camera nếu có ellipsoid

             if (hit && hit.hit) {
                 camera.cameraDirection.y = JUMP_FORCE;
             }
        }

        // Mở khóa chuột bằng ESC
        if (event.key === "Escape" && isPointerLocked) {
            document.exitPointerLock();
        }
    });

    // Xử lý nhả phím
    window.addEventListener("keyup", (event) => {
        inputMap[event.key.toLowerCase()] = false;
    });

    // Xử lý click chuột (khóa chuột và bắn)
    canvas.addEventListener("pointerdown", (event) => {
        // Nếu chưa khóa chuột và chưa game over -> yêu cầu khóa
        if (!isPointerLocked && !gameOver) {
            canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock || canvas.msRequestPointerLock;
            if (canvas.requestPointerLock) {
                canvas.requestPointerLock();
                isPointerLocked = true; // Giả định là sẽ khóa thành công (sẽ được cập nhật lại bởi sự kiện)
            }
        }
        // Nếu đã khóa chuột, chưa game over, và là nút trái -> bắn
        else if (isPointerLocked && !gameOver && event.button === 0) {
            const currentTime = performance.now();
            if (currentTime - lastFireTime > FIRE_RATE) {
                fireProjectile();
                lastFireTime = currentTime;
            }
        }
    });

    // Xử lý di chuyển chuột (nhìn xung quanh)
    canvas.addEventListener("mousemove", (event) => {
        if (isPointerLocked && !gameOver) { // Chỉ xử lý khi chuột đã khóa và chưa game over
            handleMouseLook(event);
        }
    });

    // Lắng nghe sự kiện thay đổi trạng thái khóa con trỏ
    // (Sự kiện này sẽ cập nhật isPointerLocked chính xác)
    document.addEventListener("pointerlockchange", pointerLockChangeHandler, false);
    document.addEventListener("mozpointerlockchange", pointerLockChangeHandler, false);
    document.addEventListener("webkitpointerlockchange", pointerLockChangeHandler, false);
    document.addEventListener("mspointerlockchange", pointerLockChangeHandler, false);
}

function pointerLockChangeHandler() {
    const controlEnabled = !!(document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement || document.msPointerLockElement);
    isPointerLocked = controlEnabled; // Cập nhật trạng thái khóa

    if (!isPointerLocked) {
        // Nếu mất khóa chuột, hiện lại hướng dẫn (nếu chưa game over)
        if (!gameOver) {
            instructionsUI.style.display = 'block';
        }
        // Reset input map để dừng di chuyển
        inputMap = {};
        camera.cameraDirection.x = 0;
        camera.cameraDirection.z = 0;
    } else {
        // Nếu khóa thành công, ẩn hướng dẫn
        instructionsUI.style.display = 'none';
    }
}


function handleMouseLook(event) {
    const offsetX = event.movementX || event.mozMovementX || event.webkitMovementX || event.msMovementX || 0;
    const offsetY = event.movementY || event.mozMovementY || event.webkitMovementY || event.msMovementY || 0;

    camera.cameraRotation.y += offsetX * MOUSE_SENSITIVITY;
    camera.cameraRotation.x += offsetY * MOUSE_SENSITIVITY;
    // Giới hạn góc nhìn dọc chặt chẽ hơn một chút
    camera.cameraRotation.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, camera.cameraRotation.x));
}


function handleMovement(deltaTime) {
    // Chỉ xử lý di chuyển ngang khi chuột đã khóa
    if (isPointerLocked) {
        const moveSpeed = PLAYER_SPEED * deltaTime;
        const direction = BABYLON.Vector3.Zero();
        const forward = camera.getDirection(BABYLON.Axis.Z);
        const right = camera.getDirection(BABYLON.Axis.X);

        if (inputMap["w"]) { direction.addInPlace(forward); }
        if (inputMap["s"]) { direction.subtractInPlace(forward); }
        if (inputMap["a"]) { direction.subtractInPlace(right); }
        if (inputMap["d"]) { direction.addInPlace(right); }

        if (direction.lengthSquared() > 0) {
            // Chuẩn hóa để tốc độ không đổi khi đi chéo
            const moveDirection = direction.normalize().scaleInPlace(moveSpeed);
            camera.cameraDirection.x = moveDirection.x;
            camera.cameraDirection.z = moveDirection.z;
        } else {
            camera.cameraDirection.x = 0;
            camera.cameraDirection.z = 0;
        }
    } else {
        // Nếu chuột không khóa, dừng di chuyển ngang
        camera.cameraDirection.x = 0;
        camera.cameraDirection.z = 0;
    }
    // Trọng lực và nhảy (cameraDirection.y) được engine xử lý thông qua scene.gravity và JUMP_FORCE
}


function fireProjectile() {
    const projectile = BABYLON.MeshBuilder.CreateSphere("projectile", { diameter: 0.18 }, scene); // Đạn hơi to hơn
    const projMat = new BABYLON.StandardMaterial("projMat", scene);
    projMat.diffuseColor = new BABYLON.Color3(1, 0.9, 0.5);
    projMat.emissiveColor = new BABYLON.Color3(0.7, 0.5, 0.1); // Tự sáng mạnh hơn
    projMat.disableLighting = true; // Đạn không cần bị ảnh hưởng bởi ánh sáng
    projectile.material = projMat;
    projectile.isPickable = false; // Đạn không cần bị pick

    // Tính vị trí đầu nòng súng chính xác hơn
    const gunTipLocal = new BABYLON.Vector3(0, 0.07, 1.0); // Vị trí đầu nòng cục bộ so với gunRoot
    const gunTipWorld = BABYLON.Vector3.TransformCoordinates(gunTipLocal, gunMesh.getWorldMatrix());
    projectile.position = gunTipWorld;

    // Hướng bắn
    projectile.direction = camera.getDirection(BABYLON.Axis.Z).normalize();
    projectile.lifeTimer = PROJECTILE_LIFETIME;

    projectiles.push(projectile);
    animateGunRecoil();
}


function animateGunRecoil() {
    if (!gunMesh) return;
    const recoilAmount = -0.1; // Tăng độ giật
    const recoilDuration = 5; // Frame
    const anim = new BABYLON.Animation("gunRecoil", "position.z", 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    const keys = [];
    const startPos = gunMesh.position.z;
    keys.push({ frame: 0, value: startPos });
    keys.push({ frame: recoilDuration * 0.4, value: startPos + recoilAmount }); // Giật nhanh
    keys.push({ frame: recoilDuration, value: startPos }); // Về chậm hơn
    anim.setKeys(keys);
    const easingFunction = new BABYLON.CircleEase(); // Đổi Easing
    easingFunction.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
    anim.setEasingFunction(easingFunction);
    scene.beginDirectAnimation(gunMesh, [anim], 0, recoilDuration, false);
}


function updateProjectiles(deltaTime) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];

        if (!p || p.isDisposed()) {
            if (projectiles[i] === p) projectiles.splice(i, 1);
            continue;
        }

        const moveVector = p.direction.scale(PROJECTILE_SPEED * deltaTime);
        const prevPos = p.position.clone();
        p.position.addInPlace(moveVector);

        p.lifeTimer -= deltaTime;
        if (p.lifeTimer <= 0) {
            p.dispose();
            projectiles.splice(i, 1);
            continue;
        }

        // Raycast kiểm tra va chạm mục tiêu
        const rayLength = moveVector.length() * 1.1; // Chiều dài ray bằng quãng đường + buffer nhỏ
        const ray = new BABYLON.Ray(prevPos, p.direction, rayLength);

        // *** Predicate Function tối ưu hơn: chỉ kiểm tra mesh có isPickable và là target ***
        const hitInfo = scene.pickWithRay(ray, (mesh) => mesh.isPickable && targets.includes(mesh));

        let targetHit = null; // Lưu trữ mục tiêu bị bắn trúng

        if (hitInfo?.hit && hitInfo.pickedMesh && hitInfo.distance <= rayLength) {
             targetHit = hitInfo.pickedMesh; // Lấy mục tiêu
        }

        // Xử lý va chạm mục tiêu (nếu có)
        if (targetHit) {
            const targetIndex = targets.indexOf(targetHit);
            if (targetIndex > -1) {
                // Gọi xử lý va chạm
                handleTargetHit(targetHit, p); // Hàm này sẽ lo dispose target + animation

                // Xóa target khỏi mảng ngay lập tức
                targets.splice(targetIndex, 1);

                // Dispose và xóa đạn khỏi mảng
                if (!p.isDisposed()) p.dispose();
                projectiles.splice(i, 1);

                continue; // Chuyển sang đạn tiếp theo
            }
        }

        // Kiểm tra va chạm tường (nếu không trúng mục tiêu)
        const wallCheckRay = new BABYLON.Ray(p.position, p.direction, 0.2); // Ray ngắn kiểm tra phía trước
        const wallHit = scene.pickWithRay(wallCheckRay, (mesh) => mesh.checkCollisions && mesh.name.startsWith("wall")); // Chỉ kiểm tra tường

        if (wallHit && wallHit.hit) {
            // Tạo hiệu ứng nhỏ khi chạm tường (Tùy chọn)
             // ví dụ: createSparks(p.position);
            if (!p.isDisposed()) p.dispose();
            projectiles.splice(i, 1);
            // continue; // Không cần ở cuối
        }
    }
}


function handleTargetHit(target, projectile) {
    // Kiểm tra target có hợp lệ không
    if (!target || target.isDisposed() || !target.metadata) {
        console.warn("Invalid target in handleTargetHit");
        return;
    }

    // Cập nhật điểm
    const points = target.metadata.points || 1;
    score += points;
    scoreUI.textContent = "Score: " + score;

    // Animation cho target
    const animDuration = 10; // Frame
    const animation = new BABYLON.Animation("targetHit", "scaling", 60, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    const keys = [];
    const startScaling = target.scaling ? target.scaling.clone() : BABYLON.Vector3.One();
    keys.push({ frame: 0, value: startScaling });
    keys.push({ frame: animDuration * 0.4, value: startScaling.scale(1.4) }); // Phình to hơn
    keys.push({ frame: animDuration, value: new BABYLON.Vector3(0.01, 0.01, 0.01) }); // Thu nhỏ
    animation.setKeys(keys);
    const easingFunction = new BABYLON.BackEase(0.6); // Đổi Easing Function
    easingFunction.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
    animation.setEasingFunction(easingFunction);

    if (!target.animations) target.animations = [];
    target.animations.push(animation);

    // Chạy animation và dispose target sau khi xong
    target.isPickable = false; // Ngừng cho phép bắn trúng ngay lập tức
    scene.beginAnimation(target, 0, animDuration, false, 1, () => {
        if (target && !target.isDisposed()) {
            target.dispose();
        }
    });

    // Projectile đã được dispose trong updateProjectiles ngay sau khi gọi hàm này
}


function updateMovingTargets(deltaTime) {
    const epsilon = 0.2; // Tăng khoảng cách chấp nhận đến đích

    targets.forEach(target => {
        if (target && !target.isDisposed() && target.metadata?.isMoving) {
            const meta = target.metadata;
            if (!meta.pointA || !meta.pointB || !meta.currentTarget) return; // Kiểm tra metadata

            const currentPos = target.position;
            const targetPos = meta.currentTarget;

            const direction = targetPos.subtract(currentPos);
            const distance = direction.length();

            if (distance > epsilon) {
                const moveDistance = Math.min(distance, meta.moveSpeed * deltaTime); // Không di chuyển quá đích
                const moveVector = direction.normalizeToNew().scaleInPlace(moveDistance);
                target.position.addInPlace(moveVector);
            } else {
                // Đã đến đích -> đổi mục tiêu
                target.position.copyFrom(targetPos); // Snap to target position
                meta.currentTarget = (meta.currentTarget === meta.pointB) ? meta.pointA : meta.pointB;
            }
        }
    });
}

function checkGameOver() {
    if (!gameOver && targets.length === 0 && score > 0) {
        gameOver = true;
        gameOverUI.style.display = 'block';
        instructionsUI.style.display = 'none'; // Ẩn hướng dẫn
        if (isPointerLocked) {
            document.exitPointerLock(); // Tự động mở khóa chuột
        }
        // Có thể thêm âm thanh hoặc hiệu ứng khác ở đây
    }
}

// --- Khởi tạo và Chạy game ---
scene = createScene();

engine.runRenderLoop(function () {
    if (scene) {
        scene.render();
    }
});

window.addEventListener("resize", function () {
    engine.resize();
});